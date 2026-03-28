package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"treasury/consensus"
	"treasury/rpc"
)

// examplePlanner 示例规划器实现
type examplePlanner struct{}

func (p *examplePlanner) Plan(ctx context.Context, state consensus.TreasuryState) ([]consensus.TransferInstruction, error) {
	var instructions []consensus.TransferInstruction
	var totalAmount consensus.BCIAmount

	// 按优先级处理待处理请求
	for _, req := range state.Pending {
		if totalAmount+req.Amount <= state.Balance {
			instructions = append(instructions, consensus.TransferInstruction{
				RequestID: req.ID,
				To:        req.To,
				Amount:    req.Amount,
				Memo:      req.Memo,
				RuleID:    "default-rule",
			})
			totalAmount += req.Amount
		}
	}

	return instructions, nil
}

func main() {
	// 创建执行器
	executor := consensus.NewInMemoryExecutor()

	// 创建规划器
	planner := &examplePlanner{}

	// 创建国库实例
	treasury, err := consensus.NewTreasury(
		consensus.Address("treasury-main-address"),
		executor,
		planner,
		consensus.WithLogger(log.New(os.Stdout, "[Treasury] ", log.LstdFlags)),
	)
	if err != nil {
		log.Fatalf("Failed to create treasury: %v", err)
	}

	// 配置RPC服务器
	serverConfig := rpc.DefaultServerConfig()
	serverConfig.Host = "0.0.0.0"
	serverConfig.Port = 9090

	// 创建交易记录存储
	store := rpc.NewInMemoryTransactionStore()

	// 创建并启动RPC服务器
	server := rpc.NewTreasuryRPCServer(treasury, serverConfig, store)
	if err := server.Start(); err != nil {
		log.Fatalf("Failed to start RPC server: %v", err)
	}

	fmt.Printf("Treasury RPC server started at %s\n", server.Addr())
	fmt.Println("Available endpoints:")
	fmt.Println("  JSON-RPC 2.0: POST /rpc")
	fmt.Println("  REST API:")
	fmt.Println("    POST /api/v1/deposit        - 资金流入")
	fmt.Println("    POST /api/v1/withdraw       - 资金流出")
	fmt.Println("    POST /api/v1/spend-request  - 提交支出请求")
	fmt.Println("    POST /api/v1/execute-outflow- 执行支出")
	fmt.Println("    GET  /api/v1/balance        - 查询余额")
	fmt.Println("    GET  /api/v1/pending-requests - 查询待处理请求")
	fmt.Println("    GET  /api/v1/state          - 查询国库状态")
	fmt.Println("    GET  /api/v1/transactions   - 查询交易历史")
	fmt.Println("    GET  /health                - 健康检查")

	// 等待中断信号
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	fmt.Println("\nShutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Stop(ctx); err != nil {
		log.Printf("Error stopping server: %v", err)
	}

	fmt.Println("Server stopped")
}
