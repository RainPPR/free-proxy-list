import re
from scrapling import Fetcher

def fetch_proxies(
    protocol: str = "", country: str = "", speed: str = "", page: int = 1
):
    """
    最简鲁棒的抓取函数：使用静态 Fetcher.get (内置 curl_cffi 模拟)
    """
    url = f"https://www.freeproxy.world/?type={protocol}&country={country}&speed={speed}&page={page}"
    try:
        # 使用 chrome 指纹模拟，这是静态 Fetcher 最鲁棒的模式
        response = Fetcher.get(url, timeout=30, retries=10)

        if response.status != 200:
            return []

        results = []
        # Response 对象本身就是 Selector，直接使用 .css()
        for row in response.css("tr"):
            cells = row.css("td")
            if len(cells) < 4:
                continue

            ip = cells[0].text.strip()
            if not re.match(r"^\d+\.\d+\.\d+\.\d+$", ip):
                continue

            port_nodes = cells[1].css("a")
            port = port_nodes[0].text.strip() if port_nodes else cells[1].text.strip()
            if not port.isdigit():
                continue

            country_nodes = cells[2].css('a[href*="country="]')
            country_code = country
            country_name = "Unknown"
            if country_nodes:
                href = country_nodes[0].attrib.get("href", "")
                c_match = re.search(r"country=([A-Z]+)", href)
                if c_match:
                    country_code = c_match.group(1)
                c_title = country_nodes[0].attrib.get("title", "")
                country_name = c_title if c_title else country_nodes[0].text.strip()

            city = cells[3].css("span")[0].text.strip()

            results.append(
                {
                    "protocol": protocol,
                    "ip": ip,
                    "port": port,
                    "shortName": f"{country_code}_{city.replace(' ', '_')}"
                    if city
                    else country_code,
                    "longName": f"{country_name} {city}" if city else country_name,
                    "remark": "freeproxyworld",
                }
            )

        return results
    except Exception:
        # 保持静默鲁棒
        return []
