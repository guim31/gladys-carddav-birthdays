# CardDAV Birthdays

Les anniversaires de vos contacts, dans le calendrier de Gladys. Connectez le carnet d'adresses
CardDAV que votre téléphone synchronise déjà (Nextcloud, iCloud, Radicale, Baïkal…) : chaque contact
qui a une date de naissance devient un événement annuel, « Anniversaire de Marie Martin (34 ans) »,
tenu à jour au fil de vos contacts. Les anniversaires de mariage peuvent suivre dans un second
calendrier.

Testée contre un vrai serveur Radicale. Nextcloud, iCloud et Baïkal suivent la même norme mais n'ont
pas été essayés avec un vrai compte : vos retours sont les bienvenus.

## Ce que vous obtenez

- **Un calendrier « Anniversaires » par utilisateur**, rempli un an à l'avance avec un événement sur
  la journée par anniversaire, avec l'âge quand l'année de naissance est connue. Il apparaît dans la
  vue Calendrier de Gladys comme n'importe quel calendrier.
- **Un calendrier « Anniversaires de mariage »**, si vous le demandez, à partir de la date
  `ANNIVERSARY` des contacts.
- **Un déclencheur de scène** chaque matin à l'heure choisie : un anniversaire aujourd'hui, demain,
  ou dans 2, 3, 7, 14 ou 30 jours, avec une phrase toute faite à envoyer ou à faire dire.
- **Une action de scène** qui donne le prochain anniversaire : qui, dans combien de jours, quel âge,
  et les anniversaires du jour.
- **Un widget de tableau de bord** avec les prochains anniversaires.
- Comme ce sont des calendriers ordinaires, les scènes intégrées de Gladys marchent aussi : « un
  événement arrive ».

## Connecter votre carnet d'adresses

Chaque utilisateur connecte son propre carnet : ouvrez **Intégrations → CardDAV Birthdays**, puis le
bloc **Mes calendriers**, remplissez les champs et **Activez**.

- **Adresse du serveur CardDAV** : l'adresse du serveur (l'intégration trouve seule les carnets), ou
  l'adresse d'un carnet précis.
- **Identifiant** et **Mot de passe ou mot de passe d'application** : utilisez un mot de passe
  d'application dès que le service en propose. Le mot de passe est gardé par Gladys et n'est jamais
  écrit dans les journaux.
- **Carnets d'adresses** : noms des carnets à lire, séparés par des virgules. Vide : tous.
- **Ajouter aussi les anniversaires de mariage** : un second calendrier avec les dates `ANNIVERSARY`.
- **Afficher l'âge dans le nom des événements** : « Anniversaire de Marie Martin (34 ans) », ou
  seulement « Anniversaire de Marie Martin ».

Puis **partagez** le calendrier (bouton du même bloc) : seuls les calendriers partagés arrivent au
tableau de bord, aux scènes et aux autres membres du foyer.

### Nextcloud

Adresse `https://cloud.example.com/remote.php/dav`, votre identifiant, et un mot de passe
d'application créé dans **Paramètres → Sécurité → Appareils et sessions**.

### iCloud

Adresse `https://contacts.icloud.com`, l'e-mail de votre identifiant Apple, et un mot de passe pour
app créé sur appleid.apple.com (**Connexion et sécurité → Mots de passe pour app**). Votre mot de
passe habituel est refusé.

### Radicale, Baïkal et autres serveurs

L'adresse du serveur, par exemple `http://192.168.1.10:5232/` pour Radicale ou
`https://dav.example.com/dav.php` pour Baïkal. Les authentifications Basic et Digest sont prises en
charge.

### Google Contacts

Pas pris en charge : le CardDAV de Google n'accepte que la connexion OAuth, que les intégrations
calendrier de Gladys ne proposent pas encore. Vos contacts Google peuvent passer par un autre serveur
qui les synchronise.

## Réglages de l'administrateur

- **Lire les carnets d'adresses** : toutes les heures, toutes les 6 heures (par défaut) ou une fois
  par jour. Seul ce qui a changé est téléchargé ; un changement de compte est lu tout de suite.
- **Heure des rappels de scène** : quand le déclencheur « Rappel d'anniversaire » se déclenche
  chaque jour (08:00 par défaut).
- **Langue des textes des scènes** : phrases et dates transmises aux scènes. Les calendriers suivent
  la langue de leur propriétaire, le widget celle de la personne qui le regarde.

## Dans Gladys

Les événements durent toute la journée, d'une semaine en arrière à un an devant ; la fenêtre avance
chaque nuit. Un anniversaire du 29 février est fêté le 28 février les années non bissextiles. Une
année de naissance absente, ou notée par convention (1604 d'Apple, 0000, 1900), donne un événement
sans l'âge.

## Widget du tableau de bord

Ajoutez le widget **Anniversaires** à un tableau de bord : les prochains anniversaires des
calendriers partagés, ceux du jour marqués « Aujourd'hui ». Réglages : combien (3, 5 ou 8), afficher
ou non les anniversaires de mariage, afficher ou non l'âge.

## Déclencheur de scène

**Rappel d'anniversaire** : chaque jour à l'heure choisie, une fois par anniversaire d'un calendrier
partagé.

- **Quand** : le jour même, ou 1, 2, 3, 7, 14 ou 30 jours avant.
- **Type** : anniversaires, anniversaires de mariage, ou les deux.
- **Contact** : le nom exact d'un contact, ou vide pour n'importe qui.

Variables : le nom, une phrase toute faite (« Anniversaire de Marie Martin (34 ans) : Demain, lundi
16 novembre. »), les jours restants, l'âge, la date, le type et le propriétaire du carnet.

## Action de scène

**Connaître le prochain anniversaire** (type facultatif) : trouvé (1 ou 0), nom, type, jours
restants, date, une phrase toute faite, l'âge (0 s'il est inconnu), le nombre d'anniversaires du
jour et leurs noms.

## Exemples de scènes

- Chaque matin à 08:00, « Rappel d'anniversaire » le jour même → envoyer la phrase sur Telegram.
- « Rappel d'anniversaire » 7 jours avant, type « anniversaires » → « Penser au cadeau de
  {{name}} ».
- En rentrant, « Connaître le prochain anniversaire », puis si « anniversaires du jour » est
  supérieur à 0 → faire dire les noms par l'enceinte.

## Dépannage

- **Le calendrier est vide** : sa description dans **Mes calendriers** dit pourquoi la dernière
  lecture a échoué (mot de passe refusé, serveur qui ne répond pas, aucun carnet de ce nom).
- **Identifiant ou mot de passe refusé** : iCloud et Nextcloud avec double authentification
  demandent un mot de passe d'application.
- **Rien dans le widget ni dans les scènes** : partagez le calendrier dans **Mes calendriers**.
- **Journaux** : Intégrations → CardDAV Birthdays → Journaux ; `LOG_LEVEL=debug` pour le détail de
  chaque lecture.

## Limites

- Lecture seule : rien n'est jamais écrit dans votre carnet d'adresses.
- Un compte CardDAV par utilisateur ; plusieurs carnets de ce compte peuvent être lus.
- Les contacts sont lus au mieux toutes les heures : un anniversaire ajouté sur le téléphone apparaît
  à la lecture suivante.
- Google Contacts n'est pas pris en charge (voir plus haut).
- Testée contre Radicale seulement. Nextcloud, iCloud et Baïkal : retours bienvenus.

## Confidentialité

Seuls le nom affiché et les dates d'un contact sont lus et gardés, en mémoire ; numéros de téléphone,
adresses, e-mails et notes ne sortent jamais de l'intégration. Les calendriers restent privés à leur
propriétaire tant qu'ils ne sont pas partagés. L'adresse du serveur, l'identifiant et le mot de passe
sont stockés par Gladys comme tout autre réglage ; l'intégration n'écrit dans son volume `/data` que
la date des derniers rappels.
