from typing import TypedDict,List,Dict, Tuple
from enum import Enum
from multiprocessing import connection

Connection = connection.Connection


class UpgradeTypes(Enum):
     software = 1
     contracts = 2
     parameter = 3

class Status(Enum):
    initialzied = 1
    queued = 2
    activating = 3
    activated = 4
    canceled = 5


Proxy_id = int
class Proxy(TypedDict):
    id: Proxy_id
    proposer: str
    proxyHash: str
    url: str

class Proxys(List[Proxy]):
    pass


class ProxyMeta(TypedDict):
    name: str
    discribe: str
    version: str


Plan_id = int
class Plan(TypedDict):
    id: Plan_id
    target:str
    status:Status
    upgradeTypes:UpgradeTypes
    breaking: bool
    planed:bool
    proposer:str
    proxy:Proxy
    proxyParameter:bytes
    startTime:str
    endTime:str

class Plans(List[Plan]):
    pass

class PlanDict ( Dict[Plan_id,Plan]):
    pass

class ProxyDict (Dict[Proxy_id,Proxy]):
    pass



ProxyMangerApi = Tuple[str,List]
    

class MyEnum(Enum):
    """Docstring for MyEnum."""
    success = 0
    fail = "some_other_value"
    

class ParameterUpdate(TypedDict):
    proxy_id: int
    param_group: str
    param_name: str
    param_value: str
    
