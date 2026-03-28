from abc import ABC, abstractmethod, abstractproperty
from typed import Plan,Status,ProxyMeta,Enum


class ProxyMethod(Enum):
    onPlanAdded = "onPlanAdded"
    onStatusUpdated = "onStatusUpdated"


class ProxyInterface(ABC):


    def __init__(self,plan:Plan) -> None:
        self.plan = plan

    @abstractmethod
    def onPlanAdded(self):
        pass

    @abstractmethod
    def onStatusUpdated(self,status_from:Status, status_to:Status):
        pass

        
MAIN_INTERFACE = "Interface"





