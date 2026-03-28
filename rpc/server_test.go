package rpc

import (
	"context"
	"net/http"
	"testing"
	"time"

	"treasury/consensus"
)

// 创建测试用的Treasury实例
func setupTestTreasury(t *testing.T) *consensus.Treasury {
	executor := consensus.NewInMemoryExecutor()
	planner := &testPlanner{}

	treasury, err := consensus.NewTreasury(
		consensus.Address("treasury-system-address"),
		executor,
		planner,
	)
	if err != nil {
		t.Fatalf("failed to create treasury: %v", err)
	}

	return treasury
}

// testPlanner 测试用的规划器
type testPlanner struct{}

func (p *testPlanner) Plan(ctx context.Context, state consensus.TreasuryState) ([]consensus.TransferInstruction, error) {
	var instructions []consensus.TransferInstruction
	for _, req := range state.Pending {
		if req.Amount <= state.Balance {
			instructions = append(instructions, consensus.TransferInstruction{
				RequestID: req.ID,
				To:        req.To,
				Amount:    req.Amount,
				Memo:      req.Memo,
				RuleID:    "test-rule",
			})
		}
	}
	return instructions, nil
}

func TestRPCServer_StartStop(t *testing.T) {
	treasury := setupTestTreasury(t)

	config := DefaultServerConfig()
	config.Port = 19090 // 使用不同端口避免冲突

	server := NewTreasuryRPCServer(treasury, config, nil)

	// 启动服务器
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}

	if !server.IsRunning() {
		t.Error("server should be running")
	}

	// 等待服务器准备就绪
	time.Sleep(100 * time.Millisecond)

	// 测试健康检查端点
	resp, err := http.Get("http://localhost:19090/health")
	if err != nil {
		t.Fatalf("health check failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	// 停止服务器
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Stop(ctx); err != nil {
		t.Fatalf("failed to stop server: %v", err)
	}

	if server.IsRunning() {
		t.Error("server should not be running")
	}
}

func TestRPCClient_Deposit(t *testing.T) {
	treasury := setupTestTreasury(t)

	config := DefaultServerConfig()
	config.Port = 19091

	server := NewTreasuryRPCServer(treasury, config, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop(context.Background())

	time.Sleep(100 * time.Millisecond)

	// 创建客户端
	clientConfig := DefaultClientConfig()
	clientConfig.ServerAddr = "localhost:19091"
	client := NewTreasuryRPCClient(clientConfig)

	ctx := context.Background()

	// 测试存款
	result, err := client.Deposit(ctx, 1000, &CoinbaseMetaJSON{
		BlockHeight: 100,
		Producer:    "test-producer",
		Memo:        "test deposit",
	})
	if err != nil {
		t.Fatalf("deposit failed: %v", err)
	}

	if !result.Success {
		t.Errorf("expected success, got message: %s", result.Message)
	}

	if result.TxID == "" {
		t.Error("expected tx_id to be set")
	}

	if result.NewBalance != 1000 {
		t.Errorf("expected balance 1000, got %d", result.NewBalance)
	}
}

func TestRPCClient_GetBalance(t *testing.T) {
	treasury := setupTestTreasury(t)

	config := DefaultServerConfig()
	config.Port = 19092

	server := NewTreasuryRPCServer(treasury, config, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop(context.Background())

	time.Sleep(100 * time.Millisecond)

	clientConfig := DefaultClientConfig()
	clientConfig.ServerAddr = "localhost:19092"
	client := NewTreasuryRPCClient(clientConfig)

	ctx := context.Background()

	// 先存款
	_, err := client.Deposit(ctx, 5000, nil)
	if err != nil {
		t.Fatalf("deposit failed: %v", err)
	}

	// 查询余额
	result, err := client.GetBalance(ctx, "")
	if err != nil {
		t.Fatalf("get balance failed: %v", err)
	}

	if !result.Success {
		t.Errorf("expected success, got message: %s", result.Message)
	}

	if result.Balance != 5000 {
		t.Errorf("expected balance 5000, got %d", result.Balance)
	}
}

func TestRPCClient_SpendRequestAndOutflow(t *testing.T) {
	treasury := setupTestTreasury(t)

	config := DefaultServerConfig()
	config.Port = 19093

	server := NewTreasuryRPCServer(treasury, config, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop(context.Background())

	time.Sleep(100 * time.Millisecond)

	clientConfig := DefaultClientConfig()
	clientConfig.ServerAddr = "localhost:19093"
	client := NewTreasuryRPCClient(clientConfig)

	ctx := context.Background()

	// 先存款
	_, err := client.Deposit(ctx, 10000, nil)
	if err != nil {
		t.Fatalf("deposit failed: %v", err)
	}

	// 提交支出请求
	spendResult, err := client.SubmitSpendRequest(ctx, "req-001", "recipient-address", 3000, 1, "test spend", nil)
	if err != nil {
		t.Fatalf("submit spend request failed: %v", err)
	}

	if !spendResult.Success {
		t.Errorf("expected success, got message: %s", spendResult.Message)
	}

	// 查询待处理请求
	pendingResult, err := client.GetPendingRequests(ctx, 0, 0)
	if err != nil {
		t.Fatalf("get pending requests failed: %v", err)
	}

	if pendingResult.Total != 1 {
		t.Errorf("expected 1 pending request, got %d", pendingResult.Total)
	}

	// 执行支出
	outflowResult, err := client.ExecuteOutflow(ctx, nil)
	if err != nil {
		t.Fatalf("execute outflow failed: %v", err)
	}

	if !outflowResult.Success {
		t.Errorf("expected success, got message: %s", outflowResult.Message)
	}

	if outflowResult.TotalAmount != 3000 {
		t.Errorf("expected total amount 3000, got %d", outflowResult.TotalAmount)
	}

	// 验证余额
	balanceResult, err := client.GetBalance(ctx, "")
	if err != nil {
		t.Fatalf("get balance failed: %v", err)
	}

	if balanceResult.Balance != 7000 {
		t.Errorf("expected balance 7000, got %d", balanceResult.Balance)
	}
}

func TestRPCClient_GetTreasuryState(t *testing.T) {
	treasury := setupTestTreasury(t)

	config := DefaultServerConfig()
	config.Port = 19094

	server := NewTreasuryRPCServer(treasury, config, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop(context.Background())

	time.Sleep(100 * time.Millisecond)

	clientConfig := DefaultClientConfig()
	clientConfig.ServerAddr = "localhost:19094"
	client := NewTreasuryRPCClient(clientConfig)

	ctx := context.Background()

	// 存款
	_, err := client.Deposit(ctx, 8000, nil)
	if err != nil {
		t.Fatalf("deposit failed: %v", err)
	}

	// 提交两个支出请求
	client.SubmitSpendRequest(ctx, "req-a", "addr-a", 1000, 1, "", nil)
	client.SubmitSpendRequest(ctx, "req-b", "addr-b", 2000, 2, "", nil)

	// 获取状态
	stateResult, err := client.GetTreasuryState(ctx)
	if err != nil {
		t.Fatalf("get treasury state failed: %v", err)
	}

	if !stateResult.Success {
		t.Errorf("expected success, got message: %s", stateResult.Message)
	}

	if stateResult.Balance != 8000 {
		t.Errorf("expected balance 8000, got %d", stateResult.Balance)
	}

	if stateResult.PendingCount != 2 {
		t.Errorf("expected 2 pending requests, got %d", stateResult.PendingCount)
	}

	if stateResult.PendingTotal != 3000 {
		t.Errorf("expected pending total 3000, got %d", stateResult.PendingTotal)
	}
}

func TestRPCClient_TransactionHistory(t *testing.T) {
	treasury := setupTestTreasury(t)

	config := DefaultServerConfig()
	config.Port = 19095

	server := NewTreasuryRPCServer(treasury, config, nil)
	if err := server.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}
	defer server.Stop(context.Background())

	time.Sleep(100 * time.Millisecond)

	clientConfig := DefaultClientConfig()
	clientConfig.ServerAddr = "localhost:19095"
	client := NewTreasuryRPCClient(clientConfig)

	ctx := context.Background()

	// 存款两次
	client.Deposit(ctx, 5000, nil)
	client.Deposit(ctx, 3000, nil)

	// 查询交易历史
	historyResult, err := client.GetTransactionHistory(ctx, "", 0, 0, 0, 0)
	if err != nil {
		t.Fatalf("get transaction history failed: %v", err)
	}

	if !historyResult.Success {
		t.Errorf("expected success, got message: %s", historyResult.Message)
	}

	if historyResult.Total != 2 {
		t.Errorf("expected 2 transactions, got %d", historyResult.Total)
	}

	// 按类型过滤
	inflowResult, err := client.GetTransactionHistory(ctx, "inflow", 0, 0, 0, 0)
	if err != nil {
		t.Fatalf("get inflow history failed: %v", err)
	}

	if inflowResult.Total != 2 {
		t.Errorf("expected 2 inflow transactions, got %d", inflowResult.Total)
	}
}
