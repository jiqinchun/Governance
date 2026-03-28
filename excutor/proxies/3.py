from ProxyProto import ProxyInterface, MAIN_INTERFACE
from typed import Plan,Status,Proxy
from Logger import getProxyLogger
from eth_abi import abi
from GqlConnector import fetchProxies
from web3 import Web3

MAIN_INTERFACE = "Interface"
# 网络组参数级修改
PROXY_ID = 3

logger = getProxyLogger(PROXY_ID)

class Interface(ProxyInterface):
    def __init__(self, plan: Plan) -> None:
        super().__init__(plan)
        self.web3 = Web3(Web3.HTTPProvider('http://127.0.0.1:8545'))
        self.testvalue = 5
    def onPlanAdded(self):
    
        self.testvalue = 10
        logger.info("{} on Plan {} added".format(PROXY_ID,self.plan["id"]))

        proxy_id = abi.decode(["uint256"],self.plan["proxyParameter"])[0]

        logger.info("Proxy {} detected".format(proxy_id))

        proxys = fetchProxies()

        proxy_tobe_download = None
        for p in proxys:
            if p["id"] == proxy_id:
                proxy_tobe_download = p
                self.proxy_tobe_download = proxy_tobe_download
                logger.debug("Proxy {} found {}".format(proxy_id, p))
                break
        
        if proxy_tobe_download:
            download_link = proxy_tobe_download["url"]
            filename = str(proxy_id) + ".py"
            import requests
            with open("proxies/"+filename,"wb")as f:
                r = requests.get(proxy_tobe_download["url"],allow_redirects=True)
                f.write(r.content)
            
            logger.info("Proxy  {} file downloaded".format(proxy_id))

            from multiprocessing.connection import Client
            c = Client(("127.0.0.1",22321))

            module_path = '{}.{}'.format("proxies",proxy_id)
            data = ("register",[proxy_id, module_path])

            logger.info("Proxy  {} to be registed".format(data))
            c.send(data)

            c.close()

        else:
            raise Exception("Proxy {} can't fetch from dataspirce".format(proxy_id))
        

    def onStatusUpdated(self, status_from: Status, status_to: Status):
        print(f"Status changing from {status_from} to {status_to}")
        
        # 从初始化到排队状态
        if status_from == Status.initialzied and status_to == Status.queued:
            print("任务从初始化进入队列")
            pass
 
        # 从队列到激活中状态
        elif status_from == Status.queued and status_to == Status.activating:
            print("任务开始激活")
            # 这里可以添加开始激活时的操作
            pass

            
        # 从激活中到已激活状态
        elif status_from == Status.activating and status_to == Status.activated:
            print("任务已完成激活")
    
            try:
                _, param_group, param_name, param_value = self._decode_and_prepare_params("处理参数修改")
                
                # 使用 json 序列化数据，确保跨语言兼容性
                import json
                from multiprocessing.connection import Client
                
                # 创建到本地服务器的连接
                c = Client(("127.0.0.1", 22324))
                
                # 构造参数修改请求
                change_request = {
                    "action": "update",
                    "level": "parameter",
                    "group": param_group,
                    "param_name": param_name,
                    "param_value": param_value,
                }
                
                # 将请求转换为 JSON 字符串
                json_data = json.dumps(change_request)
                
                # 发送数据长度和实际数据
                length = len(json_data)
                c.send_bytes(length.to_bytes(4, byteorder='big'))
                c.send_bytes(json_data.encode('utf-8'))
                
                logger.info(f"参数修改请求已发送：{change_request}")
                c.close()
            
            except Exception as e:
                logger.error(f"参数修改失败: {str(e)}")
                raise e

            
        # 任务被取消的情况
        elif status_to == Status.canceled:
            print("任务被取消")

            try:
                _, param_group, param_name, param_value = self._decode_and_prepare_params("处理参数修改")
                
                # 使用 json 序列化数据，确保跨语言兼容性
                import json
                from multiprocessing.connection import Client
                
                # 创建到本地服务器的连接
                c = Client(("127.0.0.1", 22324))
                
                # 构造参数修改请求
                change_request = {
                    "action": "cancel",
                    "level": "parameter",
                    "group": param_group,
                    "param_name": param_name,
                    "param_value": param_value,
                }
                
                # 将请求转换为 JSON 字符串
                json_data = json.dumps(change_request)
                
                # 发送数据长度和实际数据
                length = len(json_data)
                c.send_bytes(length.to_bytes(4, byteorder='big'))
                c.send_bytes(json_data.encode('utf-8'))
                
                logger.info(f"参数修改请求已发送：{change_request}")
                c.close()
            
            except Exception as e:
                logger.error(f"参数修改失败: {str(e)}")
                raise e
    
        else:
            print(f"未处理的状态转换: 从 {status_from} 到 {status_to}")


    def _decode_and_prepare_params(self, status_description: str) -> tuple:
        try:
            # 解码代理参数，获取所有必要元素
            decoded_params = abi.decode(
                ["uint256", "string", "string", "string"],
                self.plan["proxyParameter"]
            )
            
            # 解构解码后的参数便于使用
            proxy_id, param_group, param_name, param_value = decoded_params
            
            # 记录参数处理的日志
            logger.info(
                f"{status_description}: "
                f"ID={proxy_id}, 组={param_group}, 参数={param_name}, 值={param_value}"
            )
            
            return proxy_id, param_group, param_name, param_value
            
        except Exception as e:
            error_msg = f"{status_description}参数解码失败"
            logger.error(f"{error_msg}: {str(e)}")
            raise e