test:
	docker run -d --name proxytest -p 8080:8080 -v d:\Github\proxy\free-proxy-list\config.yml:/app/config.yml -v d:\Github\proxy\free-proxy-list\data:/app/data free-proxy-list

build:
	docker build -t free-proxy-list .
