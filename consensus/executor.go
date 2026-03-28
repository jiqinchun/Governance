package consensus

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
)

// MintRequest instructs the UTXO executor to mint coinbase funds to an address.
type MintRequest struct {
	To       Address
	Amount   BCIAmount
	Metadata CoinbaseMetadata
}

// TransferOutput represents a single output in a UTXO transfer transaction.
type TransferOutput struct {
	To     Address
	Amount BCIAmount
	Memo   string
	RuleID string
}

// TransferMetadata conveys contextual information for auditing purposes.
type TransferMetadata struct {
	Reason     string
	RuleIDs    []string
	RequestIDs []string
	Operator   string
	Reference  string
	Memo       string
}

// TransferRequest instructs the UTXO executor to move funds from the treasury address.
type TransferRequest struct {
	From     Address
	Outputs  []TransferOutput
	Metadata TransferMetadata
}

// UTXOExecutor abstracts the consensus client responsible for submitting treasury transactions.
type UTXOExecutor interface {
	Mint(ctx context.Context, req MintRequest) (string, error)
	Transfer(ctx context.Context, req TransferRequest) (string, error)
	Balance(ctx context.Context, address Address) (BCIAmount, error)
}

// InMemoryExecutor provides a deterministic in-memory UTXO executor for testing and simulation.
type InMemoryExecutor struct {
	mu         sync.Mutex
	balances   map[Address]BCIAmount
	txSequence uint64
}

// NewInMemoryExecutor constructs a new empty in-memory executor.
func NewInMemoryExecutor() *InMemoryExecutor {
	return &InMemoryExecutor{
		balances: make(map[Address]BCIAmount),
	}
}

// Mint credits the specified address with the requested amount.
func (e *InMemoryExecutor) Mint(_ context.Context, req MintRequest) (string, error) {
	if req.Amount == 0 {
		return "", errors.New("mint request amount must be greater than zero")
	}
	e.mu.Lock()
	defer e.mu.Unlock()

	e.balances[req.To] += req.Amount
	return e.nextTxID("mint"), nil
}

// Transfer debits the from address and credits recipients atomically.
func (e *InMemoryExecutor) Transfer(_ context.Context, req TransferRequest) (string, error) {
	if len(req.Outputs) == 0 {
		return "", errors.New("transfer requires at least one output")
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	balance := e.balances[req.From]
	var total BCIAmount
	for _, out := range req.Outputs {
		if out.Amount == 0 {
			return "", errors.New("transfer output amount must be greater than zero")
		}
		total += out.Amount
	}

	if total > balance {
		return "", fmt.Errorf("insufficient balance: have %d want %d", balance, total)
	}

	e.balances[req.From] = balance - total
	for _, out := range req.Outputs {
		e.balances[out.To] += out.Amount
	}

	return e.nextTxID("transfer"), nil
}

// Balance returns the tracked balance for the address.
func (e *InMemoryExecutor) Balance(_ context.Context, address Address) (BCIAmount, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.balances[address], nil
}

func (e *InMemoryExecutor) nextTxID(prefix string) string {
	seq := atomic.AddUint64(&e.txSequence, 1)
	return fmt.Sprintf("%s-%d", prefix, seq)
}
