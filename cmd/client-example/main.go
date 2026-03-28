package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"treasury/rpc"
)

func main() {
	// 创建客户端配置
	config := rpc.DefaultClientConfig()
	config.ServerAddr = "localhost:9090"
	config.Timeout = 30 * time.Second

	// 创建RPC客户端
	client := rpc.NewTreasuryRPCClient(config)

	ctx := context.Background()

	fmt.Println("=== Treasury RPC Client Example ===\n")

	// 1. 资金流入（存款）
	fmt.Println("1. 资金流入 (Deposit)")
	depositResult, err := client.Deposit(ctx, 100000, &rpc.CoinbaseMetaJSON{
		BlockHeight: 12345,
		Producer:    "block-producer-1",
		Reference:   "block-reward",
		Memo:        "区块奖励",
	})
	if err != nil {
		log.Printf("Deposit error: %v", err)
	} else {
		fmt.Printf("   成功: %v, 交易ID: %s, 新余额: %d\n\n",
			depositResult.Success, depositResult.TxID, depositResult.NewBalance)
	}

	// 2. 查询余额
	fmt.Println("2. 查询余额 (GetBalance)")
	balanceResult, err := client.GetBalance(ctx, "")
	if err != nil {
		log.Printf("GetBalance error: %v", err)
	} else {
		fmt.Printf("   地址: %s, 余额: %d\n\n",
			balanceResult.Address, balanceResult.Balance)
	}

	// 3. 提交支出请求
	fmt.Println("3. 提交支出请求 (SubmitSpendRequest)")
	spendResult, err := client.SubmitSpendRequest(ctx,
		"spend-001",
		"recipient-address-abc",
		25000,
		1,
		"社区激励",
		map[string]string{"category": "incentive"},
	)
	if err != nil {
		log.Printf("SubmitSpendRequest error: %v", err)
	} else {
		fmt.Printf("   成功: %v, 请求ID: %s\n\n",
			spendResult.Success, spendResult.RequestID)
	}

	// 4. 查询待处理请求
	fmt.Println("4. 查询待处理请求 (GetPendingRequests)")
	pendingResult, err := client.GetPendingRequests(ctx, 10, 0)
	if err != nil {
		log.Printf("GetPendingRequests error: %v", err)
	} else {
		fmt.Printf("   待处理数量: %d\n", pendingResult.Total)
		for _, req := range pendingResult.Requests {
			fmt.Printf("   - ID: %s, 接收方: %s, 金额: %d\n",
				req.ID, req.To, req.Amount)
		}
		fmt.Println()
	}

	// 5. 查询国库状态
	fmt.Println("5. 查询国库状态 (GetTreasuryState)")
	stateResult, err := client.GetTreasuryState(ctx)
	if err != nil {
		log.Printf("GetTreasuryState error: %v", err)
	} else {
		fmt.Printf("   系统地址: %s\n", stateResult.SystemAddress)
		fmt.Printf("   当前余额: %d\n", stateResult.Balance)
		fmt.Printf("   待处理请求数: %d\n", stateResult.PendingCount)
		fmt.Printf("   待处理总金额: %d\n\n", stateResult.PendingTotal)
	}

	// 6. 执行支出
	fmt.Println("6. 执行支出 (ExecuteOutflow)")
	outflowResult, err := client.ExecuteOutflow(ctx, &rpc.TransferMetaJSON{
		Reason:   "批量支出执行",
		Operator: "admin",
		Memo:     "自动执行",
	})
	if err != nil {
		log.Printf("ExecuteOutflow error: %v", err)
	} else {
		fmt.Printf("   成功: %v, 交易ID: %s\n", outflowResult.Success, outflowResult.TxID)
		fmt.Printf("   总金额: %d\n", outflowResult.TotalAmount)
		fmt.Printf("   执行的指令数: %d\n\n", len(outflowResult.Instructions))
	}

	// 7. 直接资金流出（取款）
	fmt.Println("7. 直接资金流出 (Withdraw)")
	withdrawResult, err := client.Withdraw(ctx, "emergency-address", 10000, &rpc.TransferMetaJSON{
		Reason:   "紧急拨款",
		Operator: "super-admin",
		Memo:     "紧急资金调拨",
	})
	if err != nil {
		log.Printf("Withdraw error: %v", err)
	} else {
		fmt.Printf("   成功: %v, 交易ID: %s, 剩余余额: %d\n\n",
			withdrawResult.Success, withdrawResult.TxID, withdrawResult.RemainingBalance)
	}

	// 8. 查询交易历史
	fmt.Println("8. 查询交易历史 (GetTransactionHistory)")
	historyResult, err := client.GetTransactionHistory(ctx, "", 0, 0, 10, 0)
	if err != nil {
		log.Printf("GetTransactionHistory error: %v", err)
	} else {
		fmt.Printf("   交易总数: %d\n", historyResult.Total)
		for _, rec := range historyResult.Records {
			fmt.Printf("   - [%s] %s: %d, From: %s, To: %s\n",
				rec.Type, rec.TxID, rec.Amount, rec.From, rec.To)
		}
		fmt.Println()
	}

	// 9. 使用REST API查询余额（备选方式）
	fmt.Println("9. 使用REST API查询余额")
	restBalanceResult, err := client.GetBalanceREST(ctx, "")
	if err != nil {
		log.Printf("GetBalanceREST error: %v", err)
	} else {
		fmt.Printf("   (REST) 余额: %d\n\n", restBalanceResult.Balance)
	}

	fmt.Println("=== 示例完成 ===")
}
