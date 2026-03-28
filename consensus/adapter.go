package consensus

import (
	"context"
	"errors"
)

// ConsensusAdapter exposes a narrow interface for consensus subsystems to
// interact with the treasury (e.g. coinbase handler, slashing module, etc.).
type ConsensusAdapter struct {
	treasury *Treasury
}

// NewConsensusAdapter wires the given treasury instance for external callers.
func NewConsensusAdapter(t *Treasury) *ConsensusAdapter {
	return &ConsensusAdapter{treasury: t}
}

// CreditBCIToSystemAddress mints BCI inflows (coinbase, slashing, donations)
// directly into the system-level UTXO address managed by the treasury.
func (a *ConsensusAdapter) CreditBCIToSystemAddress(
	ctx context.Context,
	amount BCIAmount,
	blockHeight uint64,
	producer string,
	memo string,
	extra map[string]string,
) (string, error) {
	if err := a.ensureTreasury(); err != nil {
		return "", err
	}

	meta := CoinbaseMetadata{
		BlockHeight: blockHeight,
		Producer:    producer,
		Memo:        memo,
		Extra:       extra,
	}

	return a.treasury.HandleCoinbaseInflow(ctx, amount, meta)
}

// QueueSpendRequest exposes SubmitSpendRequest for consensus submodules that need
// to enqueue outflow intents (e.g. community rewards, cross-layer funding).
func (a *ConsensusAdapter) QueueSpendRequest(req SpendRequest) error {
	if err := a.ensureTreasury(); err != nil {
		return err
	}
	return a.treasury.SubmitSpendRequest(req)
}

// ExecutePlannedTransfers allows scheduling components (e.g. epoch hooks) to
// trigger rule evaluation and send eligible BCI outflows from the system UTXO
// address in a single call.
func (a *ConsensusAdapter) ExecutePlannedTransfers(ctx context.Context, meta TransferMetadata) (*OutflowExecution, error) {
	if err := a.ensureTreasury(); err != nil {
		return nil, err
	}
	return a.treasury.ExecuteOutflow(ctx, meta)
}

// SystemAddress returns the bound system-level UTXO address so that callers can
// reference it when constructing external transactions or audit logs.
func (a *ConsensusAdapter) SystemAddress() (Address, error) {
	if err := a.ensureTreasury(); err != nil {
		return "", err
	}
	return a.treasury.SystemAddress(), nil
}

func (a *ConsensusAdapter) ensureTreasury() error {
	if a == nil || a.treasury == nil {
		return errors.New("treasury adapter not initialized")
	}
	return nil
}
