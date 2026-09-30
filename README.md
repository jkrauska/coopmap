# coopmap

US electric co-op service territories. Open `index.html` in a browser. No local server.

Map tiles and OpenLayers load from the network. The co-op polygons are in `data.js`, so the page works from a `file://` URL.

Slideshow highlights a random co-op every 20 seconds and shows a fact, preferring a story from that state or region. Press Space to skip to the next one. Most facts come from [Rural Lines, USA](https://archive.org/details/rurallinesusasto811unit_0) (USDA, 1960). The rest come from NRECA pages on electric.coop, including the [fact sheet](https://www.electric.coop/electric-cooperative-fact-sheet) and the [history](https://www.electric.coop/our-organization/history).

Hovering over a territory shows the co-op's name. On touch screens, tap a territory instead. The name on the slideshow card links to the co-op's website.

## Dependencies

Viewing the map needs only a browser. OpenLayers 10.3.1 loads from jsDelivr with a Subresource Integrity hash. Basemap tiles come from [OpenStreetMap](https://www.openstreetmap.org/copyright) under its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

Rebuilding `data.js` needs:

- [uv](https://docs.astral.sh/uv/). `make` runs `uv sync`, which installs Python 3.11+ and [Shapely](https://shapely.readthedocs.io/) into `.venv/`.
- GNU or BSD `make`.

Deploying needs [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`) and a Cloudflare account.

When bumping OpenLayers, update the `integrity` attributes in `index.html`:

```
curl -sL https://cdn.jsdelivr.net/npm/ol@vX.Y.Z/dist/ol.js | openssl dgst -sha384 -binary | openssl base64 -A
```

## Build

`make build` checks the frontend files and rebuilds `data.js` from a local cache of the ArcGIS extracts. The first content build downloads every state into `cache/` (gitignored). Later builds reuse that cache, including when `filter.py` changes.

```
make build      # js assets + data.js; downloads only when cache/ is incomplete
make js         # index.html, app.css, app.js, facts.js
make content    # data.js from cache/
make fetch      # fill cache/ and stop
make refresh    # delete cache/ and rebuild data.js
make deploy     # build, then publish to coopmap.org
```

`data.js` is generated but committed, so the page works straight from a clone.

`websites.json` maps each co-op's full name to its homepage, or `null` when no official site was found. Entries were looked up by web search because the HIFLD `WEBSITE` field is often stale, malformed, or points at a billing portal. `build.py` uses the index over HIFLD and lists any co-op missing from it as `unindexed`. Add those names to the index.

## Deploy

Cloudflare Worker with static assets, served at `coopmap.org` and `www.coopmap.org`. The zone has to be on the same Cloudflare account.

```
wrangler login
wrangler dev      # http://localhost:8787
make deploy
```

Only `index.html`, `app.css`, `app.js`, `data.js`, and `facts.js` are uploaded. Run `make content` before deploying when the territories change. `make refresh` pulls a new extract first.

## License

The [MIT License](LICENSE) covers the code in this repository: the map app (`index.html`, `app.css`, `app.js`), the build tooling (`build.py`, `filter.py`, `Makefile`), and the configuration files.

It does not cover the data or the text the app displays:

- **Territories** (`data.js`) are derived from the [America Electrical Coop Service Territories](https://www.arcgis.com/home/item.html?id=a249744f9f5e494d917086c023e9a8f1) ArcGIS item and HIFLD [Electric Retail Service Territories](https://hifld-geoplatform.hub.arcgis.com/). Their publishers' terms apply.
- **Facts** (`facts.js`) are drawn from *Rural Lines, USA* (USDA Miscellaneous Publication 811, 1960), a U.S. government work, and from NRECA pages on [electric.coop](https://www.electric.coop/), which remain NRECA's. Each fact links to its source.
- **Basemap** tiles are © OpenStreetMap contributors, available under the [ODbL](https://www.openstreetmap.org/copyright).
