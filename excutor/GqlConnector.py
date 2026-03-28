from gql import Client, gql
from gql.transport.requests import RequestsHTTPTransport

from typed import Proxy,Plan,Plans,Proxys,Connection

transport = RequestsHTTPTransport(
    url="http://localhost:8000/subgraphs/name/simple/OnchainUpdater",
    verify=True,
    retries=3,
)

client = Client(transport=transport, fetch_schema_from_transport=True)

query_plans = gql(
    """
    query MyQuery {
    plans {
        id
        breaking
        endTime
        planed
        proposer
        proxy {
            id
            proposer
            proxyHash
            url
        }
        proxyParameter
        startTime
        status
        target
        upgradeTypes
    }
    }
"""
)

query_proxies = gql(
"""
    query MyQuery {
        proxies {
            id
            proposer
            proxyHash
            url
        }
}
"""
)

from Logger import fetcherLogger

def fetchPlans() -> Plans:
    result = client.execute(query_plans)
    plans : Plans = Plans()
    for p in result["plans"]:

        # TODO 优雅的数据转换
        ps = Plan(p)
        ps["proxyParameter"] = bytes.fromhex(p["proxyParameter"][2:])
        ps["id"] = int( p["id"],16)

        ps["proxy"]["id"] = int( p["proxy"]["id"],16)
        plans.append(ps )
    
    fetcherLogger.debug(" Plans {} ".format(plans))
    return plans

def fetchProxies() -> Proxys:
    result = client.execute(query_proxies)

    proxies = Proxys()
    for p in result["proxies"]:
        proxy = Proxy(p)
        proxy["id"] = int(p["id"],16)
        proxies.append(proxy)

    fetcherLogger.debug(proxies)
    return proxies



import time

def samePlans(old:Plans,new:Plans):
    yes = str(old) == str(new)
    return yes

def planFetcher(PlanPipe: Connection, ProxyPipe: Connection):
    
    last_plans = Plans()
    fetcherLogger.info("planFetcher start")
    
    try:
        while True:
            time.sleep(5)
            plans = fetchPlans()
            if not samePlans(plans,last_plans):
                PlanPipe.send(plans)
                fetcherLogger.debug("sent to pipe")
            # time.sleep(1)
            # proxys = fetchProxies()
            # ProxyPipe.send(proxys)

    except Exception as e:
        fetcherLogger.error("fetcher failed with {}".format(e))



if __name__ == "__main__":
    ps = fetchPlans()
    print("plans")

    
    for p in ps:
        print(p)
        if(p["id"] == "0x0" ):
            from eth_abi import abi
            data = p["proxyParameter"]
            print(type(data))
            print("decode data" ,abi.decode(['uint256'],data))

    print("plans ends")