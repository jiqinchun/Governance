package consensus

import (
	"context"
	"errors"
	"testing"
)

func TestTreasuryFIFOOutflow(t *testing.T) {
	ctx := context.Background()
	executor := NewInMemoryExecutor()
	planner := NewRuleEngine(NewFirstInFirstOutRule("fifo", 100, 0))

	treasury, err := NewTreasury(Address("system-utxo"), executor, planner)
	if err != nil {
		t.Fatalf("unexpected error creating treasury: %v", err)
	}

	if _, err := treasury.HandleCoinbaseInflow(ctx, 500, CoinbaseMetadata{
		BlockHeight: 1,
		Producer:    "validator-1",
		Memo:        "block reward",
	}); err != nil {
		t.Fatalf("unexpected inflow error: %v", err)
	}

	requests := []SpendRequest{
		{ID: "r1", To: Address("recipient-a"), Amount: 200, Memo: "core dev funding"},
		{ID: "r2", To: Address("recipient-b"), Amount: 150, Memo: "ecosystem grant"},
		{ID: "r3", To: Address("recipient-c"), Amount: 150, Memo: "emergency buffer"},
	}
	for _, req := range requests {
		if err := treasury.SubmitSpendRequest(req); err != nil {
			t.Fatalf("submit spend request %s failed: %v", req.ID, err)
		}
	}

	exec, err := treasury.ExecuteOutflow(ctx, TransferMetadata{
		Reason: "scheduled_distribution",
	})
	if err != nil {
		t.Fatalf("unexpected outflow error: %v", err)
	}

	if want := BCIAmount(350); exec.TotalAmount != want {
		t.Fatalf("unexpected total amount: got %d want %d", exec.TotalAmount, want)
	}
	if len(exec.Instructions) != 2 {
		t.Fatalf("expected 2 instructions, got %d", len(exec.Instructions))
	}
	if len(exec.RequestIDs) != 2 {
		t.Fatalf("expected 2 request ids, got %d", len(exec.RequestIDs))
	}
	if exec.RequestIDs[0] != "r1" || exec.RequestIDs[1] != "r2" {
		t.Fatalf("unexpected request ids: %#v", exec.RequestIDs)
	}

	// Ensure remaining pending request is still queued.
	pending := treasury.PendingRequests()
	if len(pending) != 1 || pending[0].ID != "r3" {
		t.Fatalf("expected pending request r3, got %#v", pending)
	}

	// Insufficient spendable balance (due to reserve) should yield no eligible transfers.
	if _, err := treasury.ExecuteOutflow(ctx, TransferMetadata{Reason: "scheduled_distribution"}); !errors.Is(err, ErrNoEligibleTransfers) {
		t.Fatalf("expected ErrNoEligibleTransfers, got %v", err)
	}
}

func TestTreasuryDuplicateRequest(t *testing.T) {
	executor := NewInMemoryExecutor()
	planner := NewRuleEngine(NewFirstInFirstOutRule("fifo", 0, 0))
	treasury, err := NewTreasury(Address("system-utxo"), executor, planner)
	if err != nil {
		t.Fatalf("unexpected error creating treasury: %v", err)
	}

	req := SpendRequest{ID: "dup", To: Address("recipient"), Amount: 100}
	if err := treasury.SubmitSpendRequest(req); err != nil {
		t.Fatalf("first submission failed: %v", err)
	}
	if err := treasury.SubmitSpendRequest(req); !errors.Is(err, ErrDuplicateRequestID) {
		t.Fatalf("expected ErrDuplicateRequestID, got %v", err)
	}
}
