
from typed import Connection,PlanDict,Plans,Plan
from ProxyManager import ProxyManger,ProxyMethod
from Logger import poolManagerLogger
import pickle,os

from concurrent.futures import Future
LocalPlanPath = "./data/LocalPlan.pkl"

import atexit



class PoolManeger():
    """docstring for ClassName."""
    def __init__(self, plan_inbound_pipe:Connection , proxy_maneger: ProxyManger ):
        # super(ClassName, self).__init__()
        self.inbound_pipe = plan_inbound_pipe
        self.proxy_maneger = proxy_maneger

        if not os.path.exists("data/"):
            os.mkdir("data")
        self.local_plans = self.deserializeLocalPlan()

        self.remote_plans = Plans()

        atexit.register(self.serializeLocalPlan)

    def deserializeLocalPlan(self) -> PlanDict:

        poolManagerLogger.debug("deserializeLocalPlan from {}".format(LocalPlanPath))

        if os.path.exists(LocalPlanPath):
            with open(LocalPlanPath,"rb") as f:
                return pickle.load(f)
            
        poolManagerLogger.debug("empty Localplan from {}".format(LocalPlanPath))
        return PlanDict()

    def serializeLocalPlan(self):
        poolManagerLogger.debug("serializeLocalPlan to {}".format(LocalPlanPath))
        with open(LocalPlanPath,"wb") as f:
            pickle.dump(self.local_plans,f)

    def handlePlanAdded(self,new_plan:Plan):

        poolManagerLogger.debug("handlePlanAdded dispatch plan_id {}".format(new_plan["id"]))
        future = self.proxy_maneger.dispatch(new_plan,ProxyMethod.onPlanAdded,[])

        poolManagerLogger.debug("handlePlanAdded addcallback plan_id {}".format(new_plan["id"]))
        future.add_done_callback(self.handlePlanAddedCallBack(new_plan))

    def handlePlanAddedCallBack(self,new_plan:Plan):
    
        def callback(future: Future):
            poolManagerLogger.debug("handlePlanAddedCallBack called")
            e = future.exception() 
            if  e is None: 
                
                self.local_plans[new_plan["id"]] = new_plan # 这里没有考虑hanle崩溃之后的处理
                poolManagerLogger.debug("new_plan {} added to local_plan".format(new_plan["id"]))
            else: 
                poolManagerLogger.error("Handle plan {} [add] raise with {}".format(new_plan["id"],e))
        return callback
    

    def handlePlanUpdated(self, updated_plan:Plan, original_plan: Plan):
        
        poolManagerLogger.debug("handlePlanUpdated dispatch plan_id {}".format(original_plan["id"]))
        future = self.proxy_maneger.dispatch(original_plan,ProxyMethod.onStatusUpdated,[original_plan["status"],updated_plan["status"]])

        poolManagerLogger.debug("handlePlanUpdated addcallback plan_id {}".format(original_plan["id"]))
        future.add_done_callback(self.handlePlanUpdatedCallBack(updated_plan,original_plan))       

    
    def handlePlanUpdatedCallBack(self, updated_plan:Plan, original_plan: Plan):
        
        def callback(future: Future):
        
            poolManagerLogger.debug("handlePlanUpdatedCallBack called")
            e = future.exception() 
            if  e is None:     
                self.local_plans[original_plan["id"]] = updated_plan
                poolManagerLogger.debug("plan {} updated from {} to {}".format(original_plan["id"],original_plan["status"],updated_plan["status"]))      
            else: 
                poolManagerLogger.error("Handle plan {} [updated] raise with {}".format(original_plan["id"],e))
        return callback


    def diffPlans(self):
        
        #TODO 同步下来的任务逻辑检测：如果是acticated怎么办，如果是本地状态比链上状态提前怎么办等
        for new_plan in self.remote_plans:
            plan_id = new_plan['id']


            # 这里应该或者proxymanager实现一个队列，以处理同一个plan dispatch 冲突（一个还没完，另一个已经开始）
            if plan_id in self.local_plans.keys():

                local_plan = self.local_plans[plan_id]
                if not new_plan["status"] == local_plan["status"]:
                    poolManagerLogger.info("plan status {} updated from {} to {}".format(new_plan["id"],local_plan["status"],new_plan["status"]))
                    self.handlePlanUpdated(new_plan,local_plan)
                    
                    
            else:
                poolManagerLogger.info("new plan {} added".format(new_plan["id"]))
                poolManagerLogger.debug(new_plan)

                self.handlePlanAdded(new_plan)
                
    
    def start(self):
        poolManagerLogger.info(" Plan pool manager start")
        try:
            while True:
                self.remote_plans =  Plans(self.inbound_pipe.recv())
                poolManagerLogger.debug("Receive new plans")
                self.diffPlans()
        except Exception as e:
            poolManagerLogger.critical("stopped with {}".format(e))
            import traceback
            traceback.print_exception(e)
            self.serializeLocalPlan()