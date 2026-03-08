endpoint_list:

- https://free-proxy-list.net/en/freeproxy.html
- https://free-proxy-list.net/en/socks-proxy.html
- https://free-proxy-list.net/en/us-proxy.html
- https://free-proxy-list.net/en/uk-proxy.html
- https://free-proxy-list.net/en/anonymous-proxy.html
- https://free-proxy-list.net/en/google-proxy.html
- https://free-proxy-list.net/en/ssl-proxy.html

读取这些网页后，解析网页结构，document.querySelector("#list > div > div.table-responsive > div > table") 所指向的就是代理列表表格，每一行的格式形如：

<tr><td>69.48.201.94</td><td>80</td><td>US</td><td class="hm">United States</td><td>elite proxy</td><td class="hm">no</td><td class="hx">no</td><td class="hm">28 secs ago</td></tr>

<tr><td>20.210.76.104</td><td>8561</td><td>JP</td><td class="hm">Japan</td><td>anonymous</td><td class="hm">no</td><td class="hx">no</td><td class="hm">28 secs ago</td></tr>

……
