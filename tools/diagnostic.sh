#!/bin/bash

DB_PATH="database/elimu.db"
echo "--- DIAGNOSTIC FINANCE ELIMU (via CLI) ---"
echo "Base de données : $DB_PATH"
echo ""

# 1. Total dû réel
echo "🔹 1. Total dû réel (Année Active)"
sqlite3 $DB_PATH "SELECT SUM(montant) AS total_du FROM tranches WHERE annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1);"

# 2. Nombre d'élèves actifs
echo ""
echo "🔹 2. Nombre d'élèves actifs (Année Active)"
sqlite3 $DB_PATH "SELECT COUNT(*) AS nb_eleves FROM eleves WHERE annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1);"

# 3. Détail par type de frais
echo ""
echo "🔹 3. Détail par type de frais (Année Active)"
sqlite3 -header -column $DB_PATH "
SELECT 
  ft.nom AS type_frais,
  ft.nombre_tranches,
  ft.montant_par_tranche,
  COUNT(DISTINCT t.eleve_id) AS nb_eleves_concernes,
  SUM(t.montant) AS total_genere
FROM tranches t
JOIN frais_types ft ON ft.id = t.frais_type_id
WHERE t.annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1)
GROUP BY ft.id
ORDER BY total_genere DESC;"

# 4. Élèves sans tranches
echo ""
echo "🔹 4. Élèves actifs SANS tranches"
sqlite3 $DB_PATH "
SELECT COUNT(*) AS nb_eleves_sans_tranches
FROM eleves e
WHERE e.annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1)
AND NOT EXISTS (
  SELECT 1 FROM tranches t WHERE t.eleve_id = e.id
);"

# 5. Répartition par année scolaire
echo ""
echo "🔹 5. Répartition globale des tranches par Année Scolaire"
sqlite3 -header -column $DB_PATH "
SELECT 
  COALESCE(ascol.libelle, 'Inconnue (id:' || t.annee_scolaire_id || ')') AS annee,
  COUNT(*) AS nb_tranches,
  SUM(t.montant) AS montant_total
FROM tranches t
LEFT JOIN annees_scolaires ascol ON ascol.id = t.annee_scolaire_id
GROUP BY t.annee_scolaire_id;"

# 6. Synthèse
echo ""
echo "🔹 6. Synthèse & Comparaison"
TOTAL_REEL=$(sqlite3 $DB_PATH "SELECT SUM(montant) FROM tranches WHERE annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1);")
ESTIMATION=$((2557 * 241000))
ECART=$((TOTAL_REEL - ESTIMATION))

echo "- Total Affiché Application : 681 496 000 FCFA"
echo "- Total Calculé en Base     : $TOTAL_REEL FCFA"
echo "- Estimation Manuelle       : $ESTIMATION FCFA"
echo "- Écart (Base vs Estim)     : $ECART FCFA"

# 7. Échantillon d'élèves dépassant
echo ""
echo "🔹 7. Échantillon d'élèves dépassant 241 000 FCFA de frais"
sqlite3 -header -column $DB_PATH "
SELECT e.id, e.nom, e.prenom, c.nom_classe, SUM(t.montant) AS total_eleve
FROM eleves e
JOIN tranches t ON t.eleve_id = e.id
LEFT JOIN classes c ON c.id = e.classe_id
WHERE e.annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1)
GROUP BY e.id
HAVING total_eleve > 241000
LIMIT 15;"
