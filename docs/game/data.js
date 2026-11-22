/* Built-in sample data, used until TrEnDB answers with approved entries.
 * Values are common literature numbers (triplet energies in kcal/mol; potentials in V vs SCE, MeCN)
 * and are placeholders: TrEnDB entries with the same name replace them automatically.
 * Fields: id, name, smiles (omit for metal complexes: `formula` is shown instead), cls, role
 *   (sensitizer | photocatalyst | substrate), et, etUnc, ox, red, exOx, exRed, e00, src. */
window.TREDBOXLE_SEED = [
  // --- organic sensitizers ---
  { id: "benzophenone", name: "Benzophenone", smiles: "O=C(c1ccccc1)c1ccccc1", cls: "Aromatic ketone", role: "sensitizer", et: 69.2 },
  { id: "acetophenone", name: "Acetophenone", smiles: "CC(=O)c1ccccc1", cls: "Aromatic ketone", role: "sensitizer", et: 73.6 },
  { id: "4-meo-acetophenone", name: "4-Methoxyacetophenone", smiles: "COc1ccc(cc1)C(C)=O", cls: "Aromatic ketone", role: "sensitizer", et: 71.5 },
  { id: "xanthone", name: "Xanthone", smiles: "O=C1c2ccccc2Oc2ccccc12", cls: "Aromatic ketone", role: "sensitizer", et: 74.2 },
  { id: "michler", name: "Michler's ketone", smiles: "CN(C)c1ccc(cc1)C(=O)c1ccc(cc1)N(C)C", cls: "Aromatic ketone", role: "sensitizer", et: 61.0 },
  { id: "anthraquinone", name: "Anthraquinone", smiles: "O=C1c2ccccc2C(=O)c2ccccc12", cls: "Quinone", role: "sensitizer", et: 62.4 },
  { id: "benzil", name: "Benzil", smiles: "O=C(C(=O)c1ccccc1)c1ccccc1", cls: "1,2-Diketone", role: "sensitizer", et: 53.7 },
  { id: "biacetyl", name: "Biacetyl", smiles: "CC(=O)C(C)=O", cls: "1,2-Diketone", role: "sensitizer", et: 56.4 },
  { id: "acetone", name: "Acetone", smiles: "CC(C)=O", cls: "Aliphatic ketone", role: "sensitizer", et: 79.4 },
  { id: "carbazole", name: "Carbazole", smiles: "c1ccc2c(c1)[nH]c1ccccc12", cls: "N-Heteroarene", role: "sensitizer", et: 70.1 },
  { id: "eosin-y", name: "Eosin Y", smiles: "O=C1C(Br)=CC2=C(c3ccccc3C(=O)O)c3cc(Br)c(O)c(Br)c3OC2=C1Br", cls: "Xanthene dye", role: "photocatalyst",
    et: 43.6, ox: 0.78, red: -1.06, exOx: -1.11, exRed: 0.83, e00: 1.89 },
  { id: "4czipn", name: "4CzIPN", smiles: "N#Cc1c(n2c3ccccc3c3ccccc32)c(n2c3ccccc3c3ccccc32)c(C#N)c(n2c3ccccc3c3ccccc32)c1n2c3ccccc3c3ccccc32",
    cls: "Donor–acceptor cyanoarene (TADF)", role: "photocatalyst", ox: 1.52, red: -1.21, exOx: -1.04, exRed: 1.35, e00: 2.56 },
  { id: "acr-mes", name: "Mes-Acr-Me⁺", smiles: "Cc1cc(C)c(c(C)c1)-c1c2ccccc2[n+](C)c2ccccc12", cls: "Acridinium", role: "photocatalyst",
    red: -0.57, exRed: 2.06 },
  { id: "dca", name: "9,10-Dicyanoanthracene", smiles: "N#Cc1c2ccccc2c(C#N)c2ccccc12", cls: "Cyanoarene", role: "photocatalyst", red: -0.89, exRed: 1.99, e00: 2.88 },
  // --- metal complexes ---
  { id: "ru-bpy", name: "Ru(bpy)₃²⁺", formula: "[Ru(bpy)₃]²⁺", cls: "Ru(II) polypyridyl", role: "photocatalyst",
    et: 46.5, ox: 1.29, red: -1.33, exOx: -0.81, exRed: 0.77, e00: 2.12 },
  { id: "ru-bpz", name: "Ru(bpz)₃²⁺", formula: "[Ru(bpz)₃]²⁺", cls: "Ru(II) polypyridyl", role: "photocatalyst",
    ox: 1.86, red: -0.80, exOx: -0.26, exRed: 1.45 },
  { id: "ru-phen", name: "Ru(phen)₃²⁺", formula: "[Ru(phen)₃]²⁺", cls: "Ru(II) polypyridyl", role: "photocatalyst",
    ox: 1.26, red: -1.36, exOx: -0.87, exRed: 0.82 },
  { id: "ir-ppy3", name: "fac-Ir(ppy)₃", formula: "fac-[Ir(ppy)₃]", cls: "Cyclometalated Ir(III)", role: "photocatalyst",
    et: 55.2, ox: 0.77, red: -2.19, exOx: -1.73, exRed: 0.31, e00: 2.50 },
  { id: "ir-ppy2-dtbbpy", name: "[Ir(ppy)₂(dtbbpy)]⁺", formula: "[Ir(ppy)₂(dtbbpy)]PF₆", cls: "Cyclometalated Ir(III)", role: "photocatalyst",
    et: 49.2, ox: 1.21, red: -1.51, exOx: -0.96, exRed: 0.66 },
  { id: "ir-dfcf3", name: "[Ir(dF(CF₃)ppy)₂(dtbbpy)]⁺", formula: "[Ir(dF(CF₃)ppy)₂(dtbbpy)]PF₆", cls: "Cyclometalated Ir(III)", role: "photocatalyst",
    et: 60.1, ox: 1.69, red: -1.37, exOx: -0.89, exRed: 1.21 },
  // --- arenes (sensitizers or acceptors) ---
  { id: "benzene", name: "Benzene", smiles: "c1ccccc1", cls: "Arene", role: "substrate", et: 84.0 },
  { id: "naphthalene", name: "Naphthalene", smiles: "c1ccc2ccccc2c1", cls: "Arene", role: "substrate", et: 60.9 },
  { id: "biphenyl", name: "Biphenyl", smiles: "c1ccc(cc1)-c1ccccc1", cls: "Arene", role: "substrate", et: 65.4 },
  { id: "phenanthrene", name: "Phenanthrene", smiles: "c1ccc2c(c1)ccc1ccccc12", cls: "Arene", role: "sensitizer", et: 61.7 },
  { id: "triphenylene", name: "Triphenylene", smiles: "c1ccc2c(c1)c1ccccc1c1ccccc21", cls: "Arene", role: "sensitizer", et: 66.6 },
  { id: "fluorene", name: "Fluorene", smiles: "C1c2ccccc2-c2ccccc12", cls: "Arene", role: "sensitizer", et: 67.6 },
  { id: "pyrene", name: "Pyrene", smiles: "c1cc2ccc3cccc4ccc(c1)c2c34", cls: "Arene", role: "sensitizer", et: 48.2 },
  { id: "anthracene", name: "Anthracene", smiles: "c1ccc2cc3ccccc3cc2c1", cls: "Arene", role: "sensitizer", et: 42.6 },
  // --- typical energy-transfer substrates ---
  { id: "trans-stilbene", name: "trans-Stilbene", smiles: "c1ccc(cc1)/C=C/c1ccccc1", cls: "Alkene (styrenyl)", role: "substrate", et: 49.3 },
  { id: "cis-stilbene", name: "cis-Stilbene", smiles: "c1ccc(cc1)/C=C\\c1ccccc1", cls: "Alkene (styrenyl)", role: "substrate", et: 57.0, etUnc: 2 },
  { id: "styrene", name: "Styrene", smiles: "C=Cc1ccccc1", cls: "Alkene (styrenyl)", role: "substrate", et: 61.7 },
  { id: "isoprene", name: "Isoprene", smiles: "C=CC(C)=C", cls: "1,3-Diene", role: "substrate", et: 60.1 },
  { id: "chd", name: "1,3-Cyclohexadiene", smiles: "C1CC=CC=C1", cls: "1,3-Diene", role: "substrate", et: 52.4 },
  { id: "coumarin", name: "Coumarin", smiles: "O=c1ccc2ccccc2o1", cls: "Lactone (enone)", role: "substrate", et: 62.1 },
  { id: "oxygen", name: "Oxygen (³O₂ → ¹O₂)", smiles: "O=O", cls: "Small molecule", role: "substrate", et: 22.5 }
];
