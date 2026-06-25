# Wizard of NOS hosted-config preview

This preview build keeps the live root `/index.html` untouched. The wrapper at `preview/hosted-config-split/index.html` loads the root game HTML, injects `config/default-settings.json`, and patches the game to use an isolated preview localStorage key.

Use `?fresh=1` to clear only the preview settings key before loading, for example:

`preview/hosted-config-split/?fresh=1`

The live game's `mazeDriftSettings` key is not used by this preview wrapper.
