// HW7 — built-in bivariate datasets (aggregated counts; the page expands them into raw records
// and rebuilds the contingency table from scratch, so the counting code is exercised every time).
window.HW7_DATA = {
  titanic: {
    name: "Titanic: class × survival",
    X: "Class", F: "Survived",
    rows: ["1st", "2nd", "3rd", "Crew"], cols: ["Yes", "No"],
    O: [[203, 122], [118, 167], [178, 528], [212, 673]],
    source: "Dawson (1995), the 2 201 people aboard the RMS Titanic; R dataset <code>Titanic</code>, summed over sex and age.",
  },
  haireye: {
    name: "Hair colour × eye colour",
    X: "Hair", F: "Eye",
    rows: ["Black", "Brown", "Red", "Blond"], cols: ["Brown", "Blue", "Hazel", "Green"],
    O: [[68, 20, 15, 5], [119, 84, 54, 29], [26, 17, 14, 14], [7, 94, 10, 16]],
    source: "Snee (1974), 592 statistics students at the University of Delaware; R dataset <code>HairEyeColor</code>, summed over sex.",
  },
  ucb: {
    name: "UC Berkeley 1973: sex × admission",
    X: "Sex", F: "Admission",
    rows: ["Male", "Female"], cols: ["Admitted", "Rejected"],
    O: [[1198, 1493], [557, 1278]],
    source: "Bickel, Hammel & O'Connell (1975), graduate applications to the six largest departments; R dataset <code>UCBAdmissions</code>, summed over department.",
    // per-department tables, for the Simpson's paradox section
    strata: {
      A: [[512, 313], [89, 19]], B: [[353, 207], [17, 8]], C: [[120, 205], [202, 391]],
      D: [[138, 279], [131, 244]], E: [[53, 138], [94, 299]], F: [[22, 351], [24, 317]],
    },
  },
};
