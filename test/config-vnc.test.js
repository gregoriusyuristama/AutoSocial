const test = require("node:test");
const assert = require("node:assert/strict");

test("config exposes vnc port ranges with defaults", () => {
  delete process.env.VNC_PORT_RANGE_START;
  delete process.env.VNC_PORT_RANGE_END;
  delete require.cache[require.resolve("../src/config")];
  const { config } = require("../src/config");
  assert.equal(config.vncPortRangeStart, 5901);
  assert.equal(config.vncPortRangeEnd, 5920);
  assert.equal(config.novncPortRangeStart, 6080);
  assert.equal(config.novncPortRangeEnd, 6099);
  assert.equal(config.vncSessionTtlSeconds, 900);
  assert.equal(config.vncMaxConcurrent, 3);
});

test("config sessionSecret empty by default", () => {
  delete process.env.SESSION_SECRET;
  delete require.cache[require.resolve("../src/config")];
  const { config } = require("../src/config");
  assert.equal(config.sessionSecret, "");
});
