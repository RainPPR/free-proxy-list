# 读入一个可能非常大的 json 文件

import json


def read_large_json(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


data = read_large_json("ui_messages.json")

# 创建一个写入到 ui_mesesages.md 的文件句柄，和两个接口，分别是写入内容和写入标题，标题只有二级标题

types = {}

with open("ui_mesesages.md", "w", encoding="utf-8") as f:
    for item in data:
        if item["type"] == "say" and item["say"] not in [
            "api_req_started",
            "reasoning",
            "tool",
            'task_progress',
            'checkpoint_created',
            'command_output',
            'command'
        ]:
            text = item.get("text", "")
            if len(text) > 5:
                f.write("# " + item["say"] + "\n\n")
                f.write(item.get("text", "") + "\n\n")
