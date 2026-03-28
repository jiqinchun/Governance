package consensus

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"sync"
)

var (
	// ErrDuplicateRequestID indicates that a spend request with the same ID already exists.
	ErrDuplicateRequestID = errors.New("treasury: duplicate spend request id")
	// ErrInsufficientBalance indicates that evaluated transfers exceed the treasury balance.
	ErrInsufficientBalance = errors.New("treasury: insufficient balance for evaluated transfers")
	// ErrNoEligibleTransfers indicates that no transfers were produced after rule evaluation.
	ErrNoEligibleTransfers = errors.New("treasury: no eligible transfers after rule evaluation")
)

// Logger abstracts structured logging dependencies.
type Logger interface {
	Printf(format string, args ...any)
}

// Treasury mediates interactions between consensus layer minting and spending logic.
type Treasury struct {
	mu            sync.Mutex
	systemAddress Address
	executor      UTXOExecutor
	planner       OutflowPlanner
	logger        Logger

	pending []SpendRequest
}

// Option configures a treasury instance.
type Option func(*Treasury)

// WithLogger injects a custom logger (defaults to discarding logs).
func WithLogger(logger Logger) Option {
	return func(t *Treasury) {
		if logger != nil {
			t.logger = logger
		}
	}
}

// NewTreasury constructs a treasury implementation bound to the specified system UTXO address.
func NewTreasury(systemAddress Address, executor UTXOExecutor, planner OutflowPlanner, opts ...Option) (*Treasury, error) {
	if systemAddress == "" {
		return nil, errors.New("treasury: system address must be provided")
	}
	if executor == nil {
		return nil, errors.New("treasury: utxo executor must be provided")
	}
	if planner == nil {
		return nil, errors.New("treasury: outflow planner must be provided")
	}

	t := &Treasury{
		systemAddress: systemAddress,
		executor:      executor,
		planner:       planner,
		logger:        log.New(io.Discard, "", log.LstdFlags),
	}
	for _, opt := range opts {
		opt(t)
	}
	return t, nil
}

// HandleCoinbaseInflow mints freshly produced BCI into the system UTXO address.
func (t *Treasury) HandleCoinbaseInflow(ctx context.Context, amount BCIAmount, meta CoinbaseMetadata) (string, error) {
	if amount == 0 {
		return "", errors.New("treasury: inflow amount must be greater than zero")
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	txID, err := t.executor.Mint(ctx, MintRequest{
		To:       t.systemAddress,
		Amount:   amount,
		Metadata: meta,
	})
	if err != nil {
		return "", fmt.Errorf("treasury: mint inflow failed: %w", err)
	}
	t.logger.Printf("treasury inflow minted %s to %s (tx=%s, height=%d, producer=%s)",
		amount, t.systemAddress, txID, meta.BlockHeight, meta.Producer)
	return txID, nil
}

// SubmitSpendRequest registers a new spend request for future rule evaluation.
func (t *Treasury) SubmitSpendRequest(req SpendRequest) error {
	if req.ID == "" {
		return errors.New("treasury: spend request id must be provided")
	}
	if req.Amount == 0 {
		return errors.New("treasury: spend request amount must be greater than zero")
	}
	if req.To == "" {
		return errors.New("treasury: spend request recipient must be provided")
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	if t.hasRequestLocked(req.ID) {
		return ErrDuplicateRequestID
	}
	t.pending = append(t.pending, req)
	t.logger.Printf("treasury queued spend request %s amount=%s to=%s", req.ID, req.Amount, req.To)
	return nil
}

// PendingRequests returns a snapshot of queued spend requests.
func (t *Treasury) PendingRequests() []SpendRequest {
	t.mu.Lock()
	defer t.mu.Unlock()
	cp := make([]SpendRequest, len(t.pending))
	copy(cp, t.pending)
	return cp
}

// ExecuteOutflow evaluates rules and, if eligible, transfers BCI from the system address.
func (t *Treasury) ExecuteOutflow(ctx context.Context, metadata TransferMetadata) (*OutflowExecution, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	balance, err := t.executor.Balance(ctx, t.systemAddress)
	if err != nil {
		return nil, fmt.Errorf("treasury: query balance failed: %w", err)
	}

	state := TreasuryState{
		SystemAddress: t.systemAddress,
		Balance:       balance,
		Pending:       append([]SpendRequest(nil), t.pending...),
	}

	instructions, err := t.planner.Plan(ctx, state)
	if err != nil {
		return nil, fmt.Errorf("treasury: outflow planning failed: %w", err)
	}
	if len(instructions) == 0 {
		return nil, ErrNoEligibleTransfers
	}

	var total BCIAmount
	requestIDs := make([]string, 0, len(instructions))
	outputs := make([]TransferOutput, 0, len(instructions))
	ruleIDs := make([]string, 0, len(instructions))
	for _, inst := range instructions {
		total += inst.Amount
		if total > balance {
			return nil, ErrInsufficientBalance
		}
		outputs = append(outputs, TransferOutput{
			To:     inst.To,
			Amount: inst.Amount,
			Memo:   inst.Memo,
			RuleID: inst.RuleID,
		})
		if inst.RequestID != "" {
			requestIDs = append(requestIDs, inst.RequestID)
		}
		if inst.RuleID != "" {
			ruleIDs = append(ruleIDs, inst.RuleID)
		}
	}

	txID, err := t.executor.Transfer(ctx, TransferRequest{
		From:     t.systemAddress,
		Outputs:  outputs,
		Metadata: metadata,
	})
	if err != nil {
		return nil, fmt.Errorf("treasury: transfer submission failed: %w", err)
	}

	if len(requestIDs) > 0 {
		t.removeRequestsLocked(requestIDs)
	}

	exec := &OutflowExecution{
		TxID:          txID,
		Instructions:  instructions,
		TotalAmount:   total,
		RuleIDs:       uniqueStrings(ruleIDs),
		RequestIDs:    uniqueStrings(requestIDs),
		SystemAddress: t.systemAddress,
	}

	t.logger.Printf("treasury outflow executed tx=%s total=%s outputs=%d", txID, total, len(outputs))
	return exec, nil
}

// SystemAddress returns the configured system UTXO address.
func (t *Treasury) SystemAddress() Address {
	return t.systemAddress
}

// PendingBalance returns the current tracked balance from the executor.
func (t *Treasury) PendingBalance(ctx context.Context) (BCIAmount, error) {
	return t.executor.Balance(ctx, t.systemAddress)
}

func (t *Treasury) hasRequestLocked(id string) bool {
	for _, req := range t.pending {
		if req.ID == id {
			return true
		}
	}
	return false
}

func (t *Treasury) removeRequestsLocked(ids []string) {
	if len(ids) == 0 {
		return
	}
	idSet := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}
	filtered := t.pending[:0]
	for _, req := range t.pending {
		if _, ok := idSet[req.ID]; ok {
			continue
		}
		filtered = append(filtered, req)
	}
	t.pending = filtered
}

func uniqueStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, v := range values {
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		unique = append(unique, v)
	}
	return unique
}
