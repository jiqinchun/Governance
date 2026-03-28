package consensus

import (
	"context"
	"fmt"
)

// OutflowPlanner produces transfer instructions based on treasury state.
type OutflowPlanner interface {
	Plan(ctx context.Context, state TreasuryState) ([]TransferInstruction, error)
}

// OutflowRule encapsulates a specific policy that may contribute transfer instructions.
type OutflowRule interface {
	ID() string
	Evaluate(ctx context.Context, state RuleContext) (RuleEvaluation, error)
}

// RuleContext exposes the current state relevant to rule evaluation.
type RuleContext struct {
	SystemAddress Address
	Balance       BCIAmount
	Pending       []SpendRequest
}

// RuleEvaluation captures the evaluation results for a rule.
type RuleEvaluation struct {
	Instructions       []TransferInstruction
	ConsumedRequestIDs []string
}

// RuleEngine orchestrates rule evaluation to produce a consolidated plan.
type RuleEngine struct {
	rules []OutflowRule
}

// NewRuleEngine builds a planner backed by the provided rules (evaluated sequentially).
func NewRuleEngine(rules ...OutflowRule) *RuleEngine {
	return &RuleEngine{rules: append([]OutflowRule(nil), rules...)}
}

// Plan evaluates registered rules in order while tracking remaining balance and pending requests.
func (e *RuleEngine) Plan(ctx context.Context, state TreasuryState) ([]TransferInstruction, error) {
	remainingBalance := state.Balance
	pending := append([]SpendRequest(nil), state.Pending...)
	var plan []TransferInstruction

	for _, rule := range e.rules {
		if remainingBalance == 0 {
			break
		}
		eval, err := rule.Evaluate(ctx, RuleContext{
			SystemAddress: state.SystemAddress,
			Balance:       remainingBalance,
			Pending:       pending,
		})
		if err != nil {
			return nil, fmt.Errorf("rule %s: %w", rule.ID(), err)
		}
		if len(eval.Instructions) == 0 {
			continue
		}

		var total BCIAmount
		for idx := range eval.Instructions {
			inst := &eval.Instructions[idx]
			if inst.Amount == 0 {
				return nil, fmt.Errorf("rule %s: produced zero-amount transfer", rule.ID())
			}
			inst.RuleID = rule.ID()
			total += inst.Amount
		}
		if total > remainingBalance {
			return nil, fmt.Errorf("rule %s: transfer total %d exceeds available balance %d", rule.ID(), total, remainingBalance)
		}
		remainingBalance -= total
		plan = append(plan, eval.Instructions...)

		if len(eval.ConsumedRequestIDs) > 0 {
			pending = removeRequestsByID(pending, eval.ConsumedRequestIDs)
		}
	}

	return plan, nil
}

// FirstInFirstOutRule processes spend requests in arrival order while respecting a reserve.
type FirstInFirstOutRule struct {
	id           string
	MinReserve   BCIAmount
	MaxBatchSize int
}

// NewFirstInFirstOutRule constructs a FIFO rule with the specified identifier.
func NewFirstInFirstOutRule(id string, minReserve BCIAmount, maxBatchSize int) *FirstInFirstOutRule {
	return &FirstInFirstOutRule{
		id:           id,
		MinReserve:   minReserve,
		MaxBatchSize: maxBatchSize,
	}
}

// ID returns the stable identifier for the rule.
func (r *FirstInFirstOutRule) ID() string {
	return r.id
}

// Evaluate selects requests sequentially without dropping below the configured reserve.
func (r *FirstInFirstOutRule) Evaluate(_ context.Context, state RuleContext) (RuleEvaluation, error) {
	if state.Balance <= r.MinReserve {
		return RuleEvaluation{}, nil
	}

	spendable := state.Balance - r.MinReserve
	var (
		instructions []TransferInstruction
		consumed     []string
		count        int
	)

	for _, req := range state.Pending {
		if r.MaxBatchSize > 0 && count >= r.MaxBatchSize {
			break
		}
		if req.Amount == 0 {
			continue
		}
		if req.Amount > spendable {
			// Stop processing further requests to preserve FIFO ordering.
			break
		}

		instructions = append(instructions, TransferInstruction{
			RequestID: req.ID,
			To:        req.To,
			Amount:    req.Amount,
			Memo:      req.Memo,
		})
		consumed = append(consumed, req.ID)
		spendable -= req.Amount
		count++

		if spendable == 0 {
			break
		}
	}

	return RuleEvaluation{
		Instructions:       instructions,
		ConsumedRequestIDs: consumed,
	}, nil
}

func removeRequestsByID(requests []SpendRequest, ids []string) []SpendRequest {
	if len(ids) == 0 {
		return requests
	}
	idSet := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}
	filtered := requests[:0]
	for _, req := range requests {
		if _, found := idSet[req.ID]; found {
			continue
		}
		filtered = append(filtered, req)
	}
	return filtered
}
