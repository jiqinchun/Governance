import importlib,os
from types import ModuleType
from typing import Type,Callable
from ProxyProto import ProxyInterface,ProxyMethod
from typed import Plan,ProxyMangerApi, Proxy_id

from hashlib import sha256
from concurrent import futures

from Logger import proxManagerServerLogger,proxyManagerLogger

def hash(input:str):
    return sha256(input.encode()).hexdigest()



def createProxyInstance(class_type: Type[ProxyInterface],plan:Plan) -> ProxyInterface:
    return class_type(plan)

def getMoudleInterFace(moudle: ModuleType) ->  Type[ProxyInterface]:

    interface_name = moudle.__getattribute__("MAIN_INTERFACE")

    return moudle.__getattribute__(interface_name)



class ProxyManger():
    
    '''
    负责Proxy的加载、持久化等
    #TODO instance的生命周期管理、持久化
    '''
    def __init__(self) -> None:


        self.excutor = futures.ThreadPoolExecutor() # TODO 使用线程并行，子线程可以对本地状态发生改变，需要有办法来防止线程冲突、利用多进程能力
        self.PROXIES_DIR = "proxies"
        self.proxy_dict : dict[Proxy_id,ModuleType] = dict()
        self.proxy_interfaces : dict[Proxy_id, Type[ProxyInterface]] = dict()
        
        self.proxy_instance : dict[str, ProxyInterface] = dict()

        proxy_files = os.listdir(self.PROXIES_DIR)
        for filename in proxy_files:
            if filename == "__init__.py" or filename == "__pycache__":
                continue

            id = self.getMoudleId(filename)
            module_path = self.getMoudlePath(filename)
            self.register(id,module_path)
    

    def getMoudlePath(self,filename:str) -> str:
        name = filename.strip(".py")
        module_path = '{}.{}'.format(self.PROXIES_DIR,name)
        return module_path
    

    def getMoudleId(self,filename:str) -> Proxy_id:
        id = int(filename.strip(".py"))
        return id
    
    
    def getProxyInstanceId(self,plan:Plan) -> str:
        return hash(str(plan["id"]) + str(plan["proxy"]["id"]))
    

    def register(self,id:Proxy_id,module_path:str):
        '''
        注册新的proxy.
        '''
        try:
            proxy = importlib.import_module(module_path)
            self.proxy_dict[id] = proxy
            self.proxy_interfaces[id] = getMoudleInterFace(proxy)
            proxyManagerLogger.info("Proxy {} registed as {}".format(id,module_path))
        
        except Exception as e:
            import traceback
            traceback.print_exc()
            proxyManagerLogger.error("Proxy {} Registed failed with ".format(id,e))

    def dispatch(self, plan:Plan, handler: ProxyMethod, parameters : list) -> futures.Future:
        '''
        调用相应的proxy实例，以便实现相应的事件驱动
        plan:入参，需要与proxy绑定的plan
        handler: 事件驱动对应的函数
        parameters : 函数对应的对象
        '''

        instance_id = self.getProxyInstanceId(plan)
        proxManagerServerLogger.debug("Proxy instance id = {} ".format(instance_id))
        
        if instance_id in self.proxy_instance.keys():
            
            proxyManagerLogger.debug("Get proxy_instance {} in local".format(instance_id))
            proxy_instance = self.proxy_instance[instance_id]
        else :

            proxyManagerLogger.debug("Create new proxy_instance id={}".format(instance_id))
            proxy_instance = createProxyInstance( self.proxy_interfaces[ plan["proxy"]["id"]],plan)
            self.proxy_instance[instance_id] = proxy_instance

        
        future = self.excutor.submit(proxy_instance.__getattribute__(handler.value),*parameters)
        proxyManagerLogger.info("Plan {} Submitted {}".format(plan["id"],handler.value,))
        proxyManagerLogger.debug("with parameters {}".format(parameters))
        # TODO 添加上下文，用以继承manager的自身变量（如ethers等）
        return future

    
from multiprocessing.connection import Listener


class ProxyMangerServer():
    '''
    将ProxyManger功能暴露出来，以便外部调用。
    TODO 之后可以用rpc框架
    '''

    def __init__(self,pm :ProxyManger, url="localhost", port = 22321) -> None:
        self.listener = Listener((url,port))  
        self.proxy_manger = pm

    def dispatcher(self, func_and_args:ProxyMangerApi ):
        # 调用相关函数

        proxManagerServerLogger.debug("dispatch {}".format(func_and_args))
        args = func_and_args[1]
        func = self.proxy_manger.__getattribute__(func_and_args[0])
        func(*args)

    def start(self):
        proxManagerServerLogger.info("ProxyManger server started on {} ".format(self.listener.address))
        while True:
            proxManagerServerLogger.info("Waiting for connection...")
            self.conn = self.listener.accept()
            proxManagerServerLogger.info("Accepted a connection.")

            while True:
                try:
                    msg = self.conn.recv()
                    proxManagerServerLogger.debug(msg)
                    if msg == "close":
                        self.conn.close()
                        break
                    else:
                        self.dispatcher(msg)
                except EOFError:
                    proxManagerServerLogger.info("Connection closed by the client.")
                    break

    
if __name__ == "__main__":
    a = ProxyManger()

    s = ProxyMangerServer(a)

    s.start()


    

