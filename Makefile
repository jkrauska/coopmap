# `make build` prepares the site.
# JS assets are the frontend sources. Content is data.js, compiled from
# cache/ so co-op extracts are not downloaded again on every build.

.PHONY: build js content fetch refresh clean deploy

build: js content

js: index.html app.css app.js facts.js
	@echo "js assets ready"

content: data.js
	@echo "content assets ready"

data.js: build.py filter.py websites.json cache/.complete | .venv
	uv run --no-sync build.py --offline

cache/.complete: | .venv
	uv run --no-sync build.py --fetch-only

.venv: pyproject.toml uv.lock
	uv sync

fetch: cache/.complete

refresh:
	rm -rf cache
	$(MAKE) content

clean:
	rm -rf cache

deploy: build
	wrangler deploy
