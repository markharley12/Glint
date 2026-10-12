/** The Yale Bright Star Catalogue's fixed-width records, and star names. */

export interface Bsc5Star {
  hr: number
  /** Bayer letter, component digit and constellation as the catalogue
   *  writes them, e.g. "Alp CMa", "Alp1Cen" — bytes 8–14 of the record. */
  desig: string
  /** J2000, degrees. */
  ra: number
  dec: number
  vmag: number
  /** B−V colour index; 0 when the catalogue gives none. */
  bv: number
}

/**
 * Parse BSC5's catalog file (VizieR V/50). Byte positions from its ReadMe,
 * 1-based there and 0-based here. Records without a J2000 position (a
 * handful of novae and non-stellar entries) are skipped.
 */
export function parseBsc5(text: string): Bsc5Star[] {
  const out: Bsc5Star[] = []
  for (const line of text.split('\n')) {
    if (line.length < 107) continue
    const rah = line.slice(75, 77).trim()
    if (rah === '') continue
    const ra = (Number(rah) + Number(line.slice(77, 79)) / 60 + Number(line.slice(79, 83)) / 3600) * 15
    const sign = line[83] === '-' ? -1 : 1
    const dec = sign * (Number(line.slice(84, 86)) + Number(line.slice(86, 88)) / 60 + Number(line.slice(88, 90)) / 3600)
    const vmag = Number.parseFloat(line.slice(102, 107))
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(vmag)) continue
    const bv = Number.parseFloat(line.slice(109, 114))
    out.push({
      hr: Number(line.slice(0, 4)),
      desig: line.slice(7, 14),
      ra,
      dec,
      vmag,
      bv: Number.isFinite(bv) ? bv : 0,
    })
  }
  return out
}

/**
 * Common names of bright and well-known stars, by catalogue designation
 * (see Bsc5Star.desig: three-letter Bayer abbreviation, component digit or
 * space, IAU constellation). Names follow the IAU Working Group on Star
 * Names where it has ruled. Every key must match a star in the output, or
 * the build stops: a typo cannot silently drop or misplace a name.
 */
export const STAR_NAMES: Record<string, string> = {
  'Alp CMa': 'Sirius',
  'Alp Car': 'Canopus',
  'Alp Boo': 'Arcturus',
  'Alp1Cen': 'Rigil Kentaurus',
  'Alp Lyr': 'Vega',
  'Alp Aur': 'Capella',
  'Bet Ori': 'Rigel',
  'Alp CMi': 'Procyon',
  'Alp Eri': 'Achernar',
  'Alp Ori': 'Betelgeuse',
  'Bet Cen': 'Hadar',
  'Alp Aql': 'Altair',
  'Alp1Cru': 'Acrux',
  'Alp Tau': 'Aldebaran',
  'Alp Sco': 'Antares',
  'Alp Vir': 'Spica',
  'Bet Gem': 'Pollux',
  'Alp PsA': 'Fomalhaut',
  'Alp Cyg': 'Deneb',
  'Bet Cru': 'Mimosa',
  'Alp Leo': 'Regulus',
  'Eps CMa': 'Adhara',
  'Alp Gem': 'Castor',
  'Gam Cru': 'Gacrux',
  'Lam Sco': 'Shaula',
  'Gam Ori': 'Bellatrix',
  'Bet Tau': 'Elnath',
  'Bet Car': 'Miaplacidus',
  'Eps Ori': 'Alnilam',
  'Alp Gru': 'Alnair',
  'Zet Ori': 'Alnitak',
  'Eps UMa': 'Alioth',
  'Alp UMa': 'Dubhe',
  'Alp Per': 'Mirfak',
  'Del CMa': 'Wezen',
  'The Sco': 'Sargas',
  'Eps Sgr': 'Kaus Australis',
  'Eps Car': 'Avior',
  'Eta UMa': 'Alkaid',
  'Bet Aur': 'Menkalinan',
  'Alp TrA': 'Atria',
  'Gam Gem': 'Alhena',
  'Alp Pav': 'Peacock',
  'Bet CMa': 'Mirzam',
  'Alp Hya': 'Alphard',
  'Alp UMi': 'Polaris',
  'Alp Ari': 'Hamal',
  'Gam1Leo': 'Algieba',
  'Bet Cet': 'Diphda',
  'Sig Sgr': 'Nunki',
  'The Cen': 'Menkent',
  'Bet And': 'Mirach',
  'Alp And': 'Alpheratz',
  'Alp Oph': 'Rasalhague',
  'Bet UMi': 'Kochab',
  'Kap Ori': 'Saiph',
  'Bet Leo': 'Denebola',
  'Bet Per': 'Algol',
  'Alp Cas': 'Schedar',
  'Bet Cas': 'Caph',
  'Zet UMa': 'Mizar',
  'Bet UMa': 'Merak',
  'Gam UMa': 'Phecda',
  'Del UMa': 'Megrez',
  'Gam Dra': 'Eltanin',
  'Eps Peg': 'Enif',
  'Bet Peg': 'Scheat',
  'Alp Peg': 'Markab',
  'Bet1Cyg': 'Albireo',
  'Gam Cyg': 'Sadr',
  'Del Ori': 'Mintaka',
  'Alp Lep': 'Arneb',
  'Alp2Lib': 'Zubenelgenubi',
  'Bet Lib': 'Zubeneschamali',
  'Alp Ser': 'Unukalhai',
  'Eps Vir': 'Vindemiatrix',
  'Alp Cep': 'Alderamin',
  'Gam1And': 'Almach',
  'Alp Cet': 'Menkar',
  'Del Cas': 'Ruchbah',
  'Eps Boo': 'Izar',
  'Alp CrB': 'Alphecca',
  'Alp Dra': 'Thuban',
  'Bet Ari': 'Sheratan',
  'Gam Peg': 'Algenib',
  'Alp1Her': 'Rasalgethi',
  'Gam Aql': 'Tarazed',
  'Gam Crv': 'Gienah',
  'Del Crv': 'Algorab',
  'Bet Crv': 'Kraz',
  'Gam Vir': 'Porrima',
  'Bet Aqr': 'Sadalsuud',
  'Alp Aqr': 'Sadalmelik',
  'Del Cap': 'Deneb Algedi',
  'Eta Tau': 'Alcyone',
  'Eta Boo': 'Muphrid',
  'Alp2CVn': 'Cor Caroli',
  'Alp Phe': 'Ankaa',
  'Lam Vel': 'Suhail',
  'Zet Pup': 'Naos',
  'Iot Car': 'Aspidiske',
  'Del Sco': 'Dschubba',
  'Bet1Sco': 'Acrab',
  'Ups Sco': 'Lesath',
  'Eta Oph': 'Sabik',
  'Del Sgr': 'Kaus Media',
  'Lam Sgr': 'Kaus Borealis',
  'Zet Sgr': 'Ascella',
  'Gam2Sgr': 'Alnasl',
  'Omi Cet': 'Mira',
  'Gam Cep': 'Errai',
  'Bet Cep': 'Alfirk',
}
