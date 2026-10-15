/* ==========================================================
   Map + scoring configuration — edit this file to change data or colors.
   See internal/DESIGN.md §6.
   ========================================================== */
window.STORY_CONFIG = {
  // Light Esri canvas basemap; labels are drawn above the bluff lines.
  basemap: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labelsUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    attribution: "Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    maxZoom: 16,
  },

  /* MGS coastal bluff layer. Use the layer URL ending in /FeatureServer/<id>,
     NOT a /query?... URL. */
  bluffs: {
    url: "https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/MGS_Coastal_Bluffs/FeatureServer/0",
    // Only bluff segments (skip N = not a bluff, X = unmapped) to keep the map fast
    where: "STABILITY IN ('S','U','H')",
    fields: ["OBJECTID", "STABILITY", "Sediment_Value", "GroundwaterOrRunoff"],
    lengthField: "Shape__Length", // meters; used for the live mileage stats
    // Extra fields fetched on click for the pop-up
    popupFields: [
      "STABILITY", "Score", "TYPE", "QUADNAME", "Confidence",
      "ToeErosion", "ExposedSedimentOnSlopes", "LandslidesOrSlumps", "FallenTrees",
      "GroundwaterOrRunoff", "FailedArmor", "Aspect", "Height", "Slope",
      "Sediment_Value", "Sediment_Score", "Habitat_Count", "Landcover", "Shape__Length",
    ],
  },

  colors: {
    S: "#2a9d6f",
    U: "#e6ac00",
    H: "#d62839",
    muted: "#c3ccd3",
    sediment: { Minimal: "#c3ccd3", Low: "#9cc3dd", Medium: "#3d7fb0", High: "#f07c1e" },
    runoff: { Minimal: "#9cc3dd", Moderate: "#2b8fd6", Extensive: "#003f67" },
  },

  /* MGS stability scoring (from the Maine Coastal Bluffs layer description).
     Shared by the "score a bluff" calculator and the map pop-ups. */
  scoring: {
    levels: ["None", "Minimal", "Moderate", "Extensive"],
    visible: [
      { field: "ToeErosion", label: "Toe erosion", points: [0, 2, 4, 6] },
      { field: "ExposedSedimentOnSlopes", label: "Exposed sediment", points: [0, 2, 4, 6] },
      { field: "LandslidesOrSlumps", label: "Landslides / slumps", points: [0, 2, 4, 6] },
      { field: "FallenTrees", label: "Fallen trees", points: [0, 2, 4, 6] },
      { field: "GroundwaterOrRunoff", label: "Groundwater / runoff", points: [0, 2, 4, 6] },
      { field: "FailedArmor", label: "Failed armor", points: [0, 2, 4, 6] },
    ],
    terrain: [
      { field: "Aspect", label: "Faces", options: [["North", 0], ["NE / NW", 2], ["East / West", 4], ["South", 6]] },
      { field: "Height", label: "Height", options: [["< 5 ft", 0], ["5–10 ft", 2], ["10–20 ft", 4], ["> 20 ft", 6]] },
      { field: "Slope", label: "Slope", options: [["< 25%", 0], ["25–50%", 2], ["50–75%", 4], ["75–100%", 6], ["> 100%", 8]] },
    ],
    // Terrain counts in full when visible > 8, half when 5–8, not at all below 5
    terrainMultiplier: function (visible) { return visible > 8 ? 1 : visible >= 5 ? 0.5 : 0; },
    rating: function (score) { return score >= 30 ? "H" : score >= 10 ? "U" : "S"; },
    gaugeMax: 50,
    presets: {
      S: { visible: [0, 1, 0, 0, 0, 0], terrain: [2, 1, 1] },
      U: { visible: [2, 2, 1, 1, 1, 0], terrain: [3, 2, 2] },
      H: { visible: [3, 3, 2, 2, 2, 0], terrain: [3, 3, 3] },
    },
  },

  labels: { S: "Stable", U: "Unstable", H: "Highly unstable", N: "Not a bluff", X: "Unmapped" },

  /* Map "views" referenced by data-view="..." on scrolly steps.
     Each returns a Leaflet path style for a feature's properties. */
  views: {
    stability: function (p, c) {
      return { color: c[p.STABILITY] || c.muted, weight: 3, opacity: 0.95 };
    },
    highly: function (p, c) {
      return p.STABILITY === "H"
        ? { color: c.H, weight: 5, opacity: 1 }
        : { color: c.muted, weight: 1.5, opacity: 0.7 };
    },
    sediment: function (p, c) {
      var col = c.sediment[p.Sediment_Value];
      return col && p.Sediment_Value !== "Minimal"
        ? { color: col, weight: p.Sediment_Value === "High" ? 5 : 3, opacity: 1 }
        : { color: c.muted, weight: 1.5, opacity: 0.7 };
    },
    runoff: function (p, c) {
      var col = c.runoff[p.GroundwaterOrRunoff];
      return col
        ? { color: col, weight: p.GroundwaterOrRunoff === "Extensive" ? 6 : 4, opacity: 1 }
        : { color: c.muted, weight: 1.5, opacity: 0.7 };
    },
  },
};
