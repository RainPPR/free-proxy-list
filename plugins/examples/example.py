import sys
import json
import traceback


def main():
    try:
        # 你的抓取逻辑
        # import requests 等等

        # 强制格式：包含 protocol, ip, port (必须整型)
        results = [
            {
                "protocol": "http",
                "ip": "222.111.0.1",
                "port": 8080,
                "shortName": "JP",
                "longName": "Japan",
                "remark": "custom-python",
            }
        ]

        # 唯一的一行输出供主进程 capture stdout
        print(json.dumps(results))
        sys.exit(0)
    except Exception as e:
        # 如果出错，静默返回空数组，可以把错误信息打到文件里调试但不能打印到终端
        # with open('err.log', 'w') as f: f.write(traceback.format_exc())
        print("[]")
        sys.exit(0)


if __name__ == "__main__":
    main()
