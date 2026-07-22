# Format de projet ESE — brouillon 0.1

## Principes

Un fichier `.ese` est une archive ZIP non chiffrée. Les noms d’entrées utilisent `/`, les documents JSON sont encodés en UTF-8 et aucun chemin absolu n’est autorisé. Le support ZIP64 est prévu avant l’import de documents volumineux ; il ne fait pas encore partie du writer 0.1.

## Arborescence minimale

```text
mimetype
manifest.json
annotations/circuits.json
renditions/<source-id>/page-<numéro>.png
```

`mimetype` contient `application/vnd.ese.project+zip`.

Le manifeste contient les métadonnées du projet, la liste des sources, des pages, des légendes et des repères. Les circuits et leurs tracés sont séparés dans `annotations/circuits.json`.

Les documents originaux tels que PDF, fichiers bureautiques ou archives ne sont pas conservés. ESE enregistre uniquement les images de travail produites ou importées et les métadonnées nécessaires à leur identification. Une source peut donc conserver son nom et son type MIME d’origine sans posséder d’`originalPath`. Le champ `sourcePageNumber` d’une page indique, lorsqu’il est connu, son numéro physique dans le document importé.

Une image importée directement peut servir simultanément de source et de rendu : ses octets ne doivent être stockés qu’une seule fois dans l’archive.

## Coordonnées

Chaque page possède une largeur et une hauteur logiques. Les points des tracés utilisent ce repère, indépendamment de la résolution d’affichage et du niveau de zoom.

Une page peut également contenir un champ facultatif `view` composé de `x`, `y`, `width` et `height`. Il mémorise son dernier rectangle de vue afin que le zoom et la position soient indépendants d’une page à l’autre et restaurés après réouverture. L’absence de ce champ signifie « vue entière », ce qui maintient la compatibilité avec les projets plus anciens.

Une intersection géométrique ne constitue jamais implicitement une jonction électrique.

## Repères et circuits

Les repères de légende sont distincts des circuits. Plusieurs circuits peuvent partager un même repère. Un repère peut contenir plusieurs marquages : couleur, numéro ou texte. Son style de surlignage reste indépendant du marquage physique.

## Évolutions prévues

Les pyramides de tuiles utiliseront des entrées sous `renditions/<source-id>/<page-id>/`. Le manifeste indiquera le format, la taille des tuiles et les niveaux disponibles. Les lecteurs doivent ignorer les champs inconnus et refuser proprement les versions majeures non prises en charge.
