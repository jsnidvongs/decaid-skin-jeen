# Jeen's skin for Decaid

A custom skin for [Decaid](https://github.com/decentespresso/decaid), Decent's companion app for the DE1 espresso machine. It is built for a 1280×800 Android tablet in landscape, in a light, open style with no boxed cards.

Tabs: **Pull a shot**, **Profiles**, **Create**, **H2O** (steam, hot water, flush), **Beans**, **History** and **Settings** (gear icon).

Graph colours are fixed everywhere: red is temperature, green is pressure, blue is flow, and dotted brown is weight flow.

## Install on the tablet

1. From any skin, press Android's Back button (or swipe in from the edge) to reach Decaid's dashboard.
2. Tap **Skins** (palette icon). The "Web Interface" page opens.
3. Tap the gear icon at the top right, then **Install skin**, then **GitHub Branch**.
4. Repository `jsnidvongs/decaid-skin-jeen`, branch `main`, then **Install**.
5. Pick **Jeen's skin** in the list.

The same thing through Decaid's API, from any computer on the same network:

```
curl -X POST http://<tablet-ip>:8080/api/v1/webui/skins/install/github-branch \
  -H 'Content-Type: application/json' \
  -d '{"repo":"jsnidvongs/decaid-skin-jeen","branch":"main"}'
```

To update, install again from the same branch. To get back to Decaid's own screens, use **Settings → About → Open dashboard**.

## Try it without a machine

`dev/fake-decaid.js` is a stand-in for Decaid with no dependencies. It serves the skin on port 3000 and a fake API and WebSockets on port 8080, with sample profiles, beans and shots. Shots, steam, hot water and flush are simulated.

```
node dev/fake-decaid.js
# open http://localhost:3000
```

Switches for testing problem states:

- `http://localhost:8080/dev/state?s=heating` (also `needsWater`, `sleeping`, `idle`)
- `http://localhost:8080/dev/scale?on=0` turns the scale off, even mid-shot
- `http://localhost:8080/dev/water?mm=3` sets the water level

To point the skin at a real tablet from your computer, add `?api=http://<tablet-ip>:8080` to the URL.

## Files

- `index.html`, `manifest.json`: the skin's entry point and its details for Decaid.
- `css/skin.css`: all styles.
- `js/api.js`: REST calls and WebSocket streams.
- `js/store.js`: live machine, scale, water and shot state.
- `js/ui.js`: shared pieces, including the graph.
- `js/app.js`: tabs, the status rail and page switching.
- `js/pages/`: one file per tab.
- `fonts/`: Glacial Indifference.

## Known limits

- Water level comes from Decaid in millimetres. The skin shows it as a percentage, where a full 2 L tank reads 65 mm (`WATER_FULL_MM` in `js/store.js`). The refill warning comes at 8 mm (`REFILL_ALERT_MM`).
- Profile tags (favourite, modern, classic) are stored in each profile's metadata in Decaid.
- "This week" in History and the bean averages are worked out by the skin.
- Steam has no stop-at-temperature, because the DE1 doesn't support it.
- If the scale drops mid-shot, Decaid finishes the shot by volume or by the profile's end, and the skin says so.

## Credits

Glacial Indifference by Hanken Design Co., under the SIL Open Font License.
