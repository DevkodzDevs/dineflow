/**
 * DineFlow for the Microsoft Store — an MSIX package (2026-11-26, the owner: "the .exe shows 'Windows protected your PC';
 * it must install straight away, with no block and no hurdle").
 *
 * Why the Store: SmartScreen warns about any installer that is not signed by a publisher it already trusts. Microsoft's own
 * signing service (Azure Artifact Signing) is not offered in India, and since 2024 even an EV certificate starts with the
 * same warning until enough people have installed it. A package submitted to the Microsoft Store is re-signed by Microsoft
 * itself, so it installs from the Store with one click and no warning, and the Store keeps it up to date. Registering as a
 * Store developer is free (individuals since 2025, companies since May 2026).
 *
 *   npm run dist:store        → dist/DineFlow-<version>.msix — upload it in Partner Center (it is signed there)
 *
 * The three values come from Partner Center → your app → Product management → Product identity:
 *   MSSTORE_IDENTITY_NAME   Package/Identity/Name                  e.g. 12345DineFlow.DineFlow
 *   MSSTORE_PUBLISHER       Package/Identity/Publisher             e.g. CN=0A1B2C3D-…
 *   MSSTORE_PUBLISHER_NAME  Package/Properties/PublisherDisplayName e.g. DineFlow
 * MSSTORE_TEST=1 builds with stand-in values, to check the package builds on this machine; that file cannot be uploaded.
 *
 * Everything else is the normal Windows build (package.json → build): the same window, the same address, the same icon.
 * The tile images are in build/appx (made from build/icon.png).
 */
const base = require("./package.json").build;

const test = process.env.MSSTORE_TEST === "1";
const pick = (key, stand) => process.env[key] || (test ? stand : "");
const identityName = pick("MSSTORE_IDENTITY_NAME", "DineFlowTest.DineFlow");
const publisher = pick("MSSTORE_PUBLISHER", "CN=00000000-0000-0000-0000-000000000000");
const publisherDisplayName = pick("MSSTORE_PUBLISHER_NAME", "DineFlow");
if (!identityName || !publisher || !publisherDisplayName) {
  throw new Error("Set MSSTORE_IDENTITY_NAME, MSSTORE_PUBLISHER and MSSTORE_PUBLISHER_NAME from Partner Center → Product identity (or MSSTORE_TEST=1 for a local test build).");
}

module.exports = {
  ...base,
  win: { ...base.win, target: [{ target: "appx", arch: ["x64"] }] },
  appx: {
    identityName,
    publisher,
    publisherDisplayName,
    applicationId: "DineFlow",
    displayName: "DineFlow",
    backgroundColor: "#0b4a35",
    showNameOnTiles: true,
    languages: ["en-IN", "en-US"],
    artifactName: test ? "DineFlow-${version}-TEST.${ext}" : "DineFlow-${version}.${ext}",
  },
};
