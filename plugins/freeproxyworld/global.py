from lib import fetch_proxies
import json
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED


def run():
    final_results = []

    # 允许通过环境变量设置最大页数，默认 0 表示不限（生产模式）
    max_pages = int(os.environ.get("MAX_SCRAPE_PAGES", "0"))
    max_workers = 8

    # 使用 8 路并发
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = set()
        current_page = 1

        # 1. 预先提交初始的 8 个任务（即第 1 到 8 页）
        for _ in range(max_workers):
            if max_pages > 0 and current_page > max_pages:
                break
            # 提交任务，并可以将 page 传进去，不过这里我们只关注结果
            futures.add(executor.submit(fetch_proxies, speed="7500", page=current_page))
            current_page += 1

        hit_end = False  # 标记是否已经抓到了最后一页

        # 2. 动态维护并发池（只要还有任务在跑，就继续循环）
        while futures:
            # 等待，直到至少有一个任务完成 (FIRST_COMPLETED)
            done, futures = wait(futures, return_when=FIRST_COMPLETED)

            # 处理完成的任务
            for fut in done:
                try:
                    page_results = fut.result()

                    if not page_results:
                        # 如果某页返回为空，说明触底了，停止提交新任务
                        hit_end = True
                    else:
                        # 汇总结果（修复了你原代码中 results 覆盖和倍增的 BUG）
                        final_results.extend(page_results)

                        # 如果还没触底，且没超过最大页数，就继续提交下一页任务
                        if not hit_end and (
                            max_pages == 0 or current_page <= max_pages
                        ):
                            futures.add(
                                executor.submit(
                                    fetch_proxies, speed="7500", page=current_page
                                )
                            )
                            current_page += 1

                except Exception as e:
                    # 修复原代码直接打印 Exception 类的问题
                    print(f"Warning: Fetch failed with error: {e}")

    # 导出
    fd, path = tempfile.mkstemp(suffix=".json", prefix="freeproxyworld-")
    with os.fdopen(fd, "w", encoding="utf-8") as tmp:
        json.dump(final_results, tmp)

    print(f"Done! Scraped {len(final_results)} proxies. Saved to: {path}")


if __name__ == "__main__":
    run()
