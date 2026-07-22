# Format d’échange JSON ESE — version 1

## Objet

Le JSON d’annotations ESE transporte les données interactives d’un schéma sans embarquer ses images. Il est destiné à sauvegarder, inspecter, comparer ou importer les repères, circuits et tracés sur les pages d’un projet ESE.

Il ne remplace pas le `.ese`, qui reste le format de projet complet avec les images de travail, ni le HTML autonome destiné à la consultation.

## Enveloppe

```json
{
  "format": "ese-annotations",
  "formatVersion": 1,
  "generator": "ESE 0.1.0",
  "sourceProjectId": "project-…",
  "title": "Titre du projet",
  "exportedAt": "2026-07-21T12:00:00.000Z",
  "pages": [],
  "legendEntries": [],
  "circuits": []
}
```

`pages` décrit l’identifiant, le nom, le numéro physique éventuel, la largeur et la hauteur logiques de chaque page. Il ne contient aucun chemin de fichier ni aucune image.

`legendEntries` conserve les références, désignations, marquages couleur/numéro/texte et styles de surlignage nécessaires aux circuits.

`circuits` conserve chaque circuit et ses portions. Une portion contient son identifiant de page et la liste ordonnée de ses points dans le repère logique de cette page.

## Association des pages à l’import

ESE cherche successivement :

1. un identifiant de page identique ;
2. un numéro de page physique identique, ou une combinaison unique nom/dimensions ;
3. la page de même rang lorsque les projets possèdent le même nombre de pages ;
4. la page active lorsqu’une seule page source reste à associer.

Lorsque les dimensions source et destination diffèrent, les coordonnées sont mises à l’échelle séparément sur les axes X et Y. Si plusieurs pages restent ambiguës, l’import est refusé sans modifier le projet.

## Repères et identifiants

Les identifiants importés sont régénérés pour éviter toute collision. Un repère portant une référence déjà présente utilise le repère existant et rejoint donc le même circuit logique. Les styles complets des nouveaux repères sont conservés.

## Compatibilité historique

ESE accepte également l’ancien export constitué directement d’un tableau JSON de circuits. Ce tableau possède les tracés, mais aucune définition de repère ni description de page. ESE réutilise alors les identifiants déjà connus du projet ; lorsqu’il ne reste qu’une page source à associer, elle est appliquée à la page active. Les repères absents sont recréés avec un style neutre modifiable.
