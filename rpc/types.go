package rpc

import (
	"time"
)

// ServerConfig RPC服务器配置
type ServerConfig struct {
	// Host 监听地址
	Host string
	// Port 监听端口
	Port int
	// MaxRecvMsgSize 最大接收消息大小（字节）
	MaxRecvMsgSize int
	// MaxSendMsgSize 最大发送消息大小（字节）
	MaxSendMsgSize int
	// ReadTimeout 读取超时
	ReadTimeout time.Duration
	// WriteTimeout 写入超时
	WriteTimeout time.Duration
	// EnableTLS 是否启用TLS
	EnableTLS bool
	// CertFile TLS证书文件路径
	CertFile string
	// KeyFile TLS密钥文件路径
	KeyFile string
}

// DefaultServerConfig 返回默认服务器配置
func DefaultServerConfig() *ServerConfig {
	return &ServerConfig{
		Host:           "0.0.0.0",
		Port:           9090,
		MaxRecvMsgSize: 4 * 1024 * 1024, // 4MB
		MaxSendMsgSize: 4 * 1024 * 1024, // 4MB
		ReadTimeout:    30 * time.Second,
		WriteTimeout:   30 * time.Second,
		EnableTLS:      false,
	}
}

// ClientConfig RPC客户端配置
type ClientConfig struct {
	// ServerAddr 服务器地址
	ServerAddr string
	// Timeout 请求超时
	Timeout time.Duration
	// EnableTLS 是否启用TLS
	EnableTLS bool
	// CertFile TLS证书文件路径（用于验证服务器）
	CertFile string
	// Insecure 是否跳过证书验证
	Insecure bool
	// MaxRetries 最大重试次数
	MaxRetries int
	// RetryInterval 重试间隔
	RetryInterval time.Duration
}

// DefaultClientConfig 返回默认客户端配置
func DefaultClientConfig() *ClientConfig {
	return &ClientConfig{
		ServerAddr:    "localhost:9090",
		Timeout:       30 * time.Second,
		EnableTLS:     false,
		Insecure:      true,
		MaxRetries:    3,
		RetryInterval: time.Second,
	}
}

// TransactionType 交易类型
type TransactionType string

const (
	// TransactionTypeInflow 资金流入
	TransactionTypeInflow TransactionType = "inflow"
	// TransactionTypeOutflow 资金流出
	TransactionTypeOutflow TransactionType = "outflow"
)

// TransactionRecord 交易记录（内部使用）
type TransactionRecord struct {
	TxID      string
	Type      TransactionType
	Amount    uint64
	From      string
	To        string
	Timestamp time.Time
	Memo      string
	Metadata  map[string]string
}

// TransactionStore 交易记录存储接口
type TransactionStore interface {
	// Save 保存交易记录
	Save(record *TransactionRecord) error
	// Query 查询交易记录
	Query(filter TransactionFilter) ([]*TransactionRecord, int, error)
}

// TransactionFilter 交易记录过滤条件
type TransactionFilter struct {
	Type      TransactionType
	StartTime *time.Time
	EndTime   *time.Time
	Limit     int
	Offset    int
}

// InMemoryTransactionStore 内存交易记录存储（用于测试）
type InMemoryTransactionStore struct {
	records []*TransactionRecord
}

// NewInMemoryTransactionStore 创建内存交易记录存储
func NewInMemoryTransactionStore() *InMemoryTransactionStore {
	return &InMemoryTransactionStore{
		records: make([]*TransactionRecord, 0),
	}
}

// Save 保存交易记录
func (s *InMemoryTransactionStore) Save(record *TransactionRecord) error {
	s.records = append(s.records, record)
	return nil
}

// Query 查询交易记录
func (s *InMemoryTransactionStore) Query(filter TransactionFilter) ([]*TransactionRecord, int, error) {
	var filtered []*TransactionRecord

	for _, record := range s.records {
		// 类型过滤
		if filter.Type != "" && record.Type != filter.Type {
			continue
		}
		// 时间范围过滤
		if filter.StartTime != nil && record.Timestamp.Before(*filter.StartTime) {
			continue
		}
		if filter.EndTime != nil && record.Timestamp.After(*filter.EndTime) {
			continue
		}
		filtered = append(filtered, record)
	}

	total := len(filtered)

	// 分页
	if filter.Offset > 0 {
		if filter.Offset >= len(filtered) {
			filtered = nil
		} else {
			filtered = filtered[filter.Offset:]
		}
	}
	if filter.Limit > 0 && len(filtered) > filter.Limit {
		filtered = filtered[:filter.Limit]
	}

	return filtered, total, nil
}
