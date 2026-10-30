# Kaiterra

## Présentation

[Kaiterra](https://www.kaiterra.com) fabrique des capteurs de qualité de l’air intérieur : le **Sensedge** et le **Sensedge Mini** pour les bureaux et les logements, et la famille **Laser Egg**. Selon le modèle et ses modules, ils mesurent les **particules fines** (PM1, PM2,5, PM10), le **CO₂**, les **composés organiques volatils** (COVT), la température, l’humidité, et parfois la pression, le NO₂, l’ozone, le CO, la luminosité et les mouvements. Chaque appareil envoie une mesure par minute au cloud Kaiterra.

Cette intégration les amène dans Gladys par l’[API officielle de Kaiterra](https://dev.kaiterra.com) : un appareil par capteur, des déclencheurs de scène quand l’air se dégrade, quand une valeur dépasse sa référence ou quand un capteur se déconnecte, une action de scène et deux widgets de tableau de bord. Elle ne fait que lire : rien n’est modifié sur vos appareils.

L’**AQI** affiché est l’indice américain de qualité de l’air des particules (celui des applis Kaiterra), calculé à partir des PM2,5 (seuils de 2024) et des PM10 : bonne (0-50), moyenne (51-100), mauvaise pour les personnes sensibles (101-150), mauvaise (151-200), très mauvaise (201-300), dangereuse (301-500). Le niveau vient toujours de la valeur.

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent (mots-clés du catalogue). Les instances plus anciennes ne peuvent pas installer l’intégration.
- Un ou plusieurs appareils Kaiterra, configurés dans l’appli Kaiterra et connectés à Internet.
- Une clé d’API Kaiterra et l’identifiant de chaque appareil (ci-dessous).

### Obtenir une clé d’API

1. Connectez-vous sur [app.kaiterra.com](https://app.kaiterra.com) avec le compte qui détient vos appareils.
2. Ouvrez **Account Settings** (paramètres du compte), puis **API Keys**, et cliquez sur **Generate API Key**. Copiez la clé.

Un appareil d’une organisation ne se lit qu’avec une clé créée par un membre de cette organisation.

### Trouver l’identifiant d’un appareil

L’API ne sait pas lister vos appareils : l’intégration a besoin de l’**identifiant unique** (UDID) de chacun, 32 chiffres hexadécimaux comme `46048117-86a7-488e-9c58-708f3470ee11`. L’appli mobile Kaiterra l’affiche dans les réglages de l’appareil ; un Sensedge l’affiche aussi dans ses propres réglages. Traitez-le comme un mot de passe : ne le publiez jamais.

## Configuration

| Champ                             | Ce qu’il faut saisir                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Clé d’API                         | La clé de votre compte Kaiterra. Enregistrée comme secret, jamais réaffichée ni écrite dans les journaux.                           |
| Identifiants des appareils (UDID) | L’identifiant de chaque appareil, avec ou sans tirets, séparés par des virgules, des espaces ou des retours à la ligne. 20 au plus. |
| Référence CO₂ (ppm)               | Au-delà, le CO₂ active le déclencheur « valeur de référence dépassée » et passe en orange. 1 000 par défaut.                        |
| Référence COVT (ppb)              | La même chose pour les composés organiques volatils. 500 par défaut.                                                                |
| Langue des textes                 | Noms des appareils et textes donnés aux scènes. Automatique : la langue du dernier widget affiché.                                  |

Deux boutons complètent l’écran : **Lire maintenant** (vérifie la clé et lit tout de suite chaque appareil, avec son nom et ses modules de capteurs) et **Diagnostic** (l’état de l’intégration dans ses journaux, sans la clé ni les identifiants des appareils).

Les autres références sont les valeurs guides 2021 de l’OMS :

| Polluant | Référence | Base de la valeur OMS      |
| -------- | --------- | -------------------------- |
| PM2,5    | 15 µg/m³  | moyenne sur 24 heures      |
| PM10     | 45 µg/m³  | moyenne sur 24 heures      |
| NO₂      | 25 µg/m³  | moyenne sur 24 heures      |
| Ozone    | 100 µg/m³ | moyenne sur 8 heures       |
| CO       | 3,5 ppm   | moyenne sur 24 h (4 mg/m³) |

L’intégration les compare à la dernière mesure, comme le fait un capteur : une indication, pas une mesure réglementaire.

## Utilisation

### Appareils

Ouvrez l’onglet **Découverte** de l’intégration et créez un appareil par capteur (« Kaiterra Office »), nommé d’après l’appli Kaiterra. Chaque appareil propose ce que le capteur mesure :

- **Indice de qualité de l’air (AQI)** et **Qualité de l’air**, son niveau en texte ;
- **PM2,5** et **PM10** (µg/m³), **CO₂** (ppm), **Composés organiques volatils (COVT)** (ppb) ;
- **Température** (°C, convertie des °F si besoin), **Humidité** (%) ;
- quand le capteur en dispose : **Pression atmosphérique** (hPa), **Dioxyde d’azote (NO₂)** et **Ozone (O₃)** (convertis des ppb en µg/m³), **Luminosité** (lx), **Mouvement**, **Point de rosée**.

Une valeur que le capteur n’a pas envoyée garde la dernière connue : aucun 0 n’est inventé. Une fonctionnalité proposée ne disparaît jamais. Les PM1 et le CO n’ont pas de catégorie dans Gladys : ils sont dans l’action de scène.

L’intégration lit tous les appareils en une requête par minute. Elle lit les noms et les modules de capteurs toutes les 6 heures, et les moyennes horaires des dernières 24 heures toutes les 30 minutes.

### Widgets du tableau de bord

![Le widget Qualité de l’air Kaiterra avec l’AQI, le CO₂, les PM2,5, les COVT et la température, et le widget Kaiterra sur 24 h avec le CO₂ des dernières 24 heures (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-kaiterra/main/docs/assets/widgets.fr.png)

- **Qualité de l’air Kaiterra** : l’AQI dans la couleur de son niveau, puis le CO₂, les PM2,5, les COVT et la température (ou ce que mesure le capteur), en vert sous 90 % de leur référence, en orange jusqu’au double, en rouge au-delà ; le conseil du niveau, les valeurs au-dessus de leur référence, l’humidité, un capteur hors ligne ou un module usé ; et un bouton **Actualiser**.
- **Kaiterra sur 24 h** : une mesure (CO₂, AQI, PM2,5, PM10, COVT, température ou humidité) en moyennes horaires sur les dernières 24 heures, avec la valeur actuelle, la moyenne et l’heure la plus haute.

Les deux ont un réglage **Appareil** (le premier par défaut).

### Scènes

Déclencheurs :

- **Kaiterra : qualité de l’air changée** : le niveau AQI change et tient 5 minutes. Filtres : appareil, nouveau niveau (un ou plusieurs), sens (dégradation, amélioration). Variables : `aqi`, `level`, `level_name`, `previous_level`, `direction`, `pm25`, `pm10`, `name`.
- **Kaiterra : valeur de référence dépassée** : CO₂, COVT, PM2,5, PM10, NO₂, ozone ou CO reste au-dessus de sa référence pendant 5 minutes. Filtres : appareil, polluant. Variables : `pollutant_name`, `value`, `unit`, `limit`, `percent`.
- **Kaiterra : retour à la normale** : cette valeur reste sous 90 % de sa référence pendant 5 minutes. Mêmes filtres et variables.
- **Kaiterra : appareil hors ligne ou de retour** : un capteur n’envoie plus de mesure depuis 15 minutes, ou recommence. Filtres : appareil, état. Variables : `state`, `last_seen`, `minutes`.
- **Kaiterra : module de capteur usé** : un module de capteur d’un Sensedge a moins de 10 % de durée de vie restante. Variables : `module`, `bay`, `lifetime`.

Action : **Kaiterra : lire l’air** d’un appareil : l’AQI et son niveau, toutes les valeurs, l’heure de la mesure, en ligne ou non, et une phrase `summary` toute prête. Elle n’active jamais de déclencheur.

Exemples :

- Quand **le CO₂ du bureau dépasse sa référence** → envoyer `Ouvrez une fenêtre : CO₂ {{triggerEvent.data.value}} ppm` sur votre téléphone ; quand il **revient à la normale** → une courte confirmation.
- Quand **la qualité de l’air devient mauvaise** → mettre le purificateur à pleine vitesse ; quand elle redevient **bonne** → le remettre en automatique.
- Quand **un appareil se déconnecte** → une notification pour vérifier son Wi-Fi.

### Transport

Cloud (`"transports": ["cloud"]`) : l’intégration contacte `api.kaiterra.com` en HTTPS avec votre clé et les identifiants de vos appareils ; Kaiterra détient déjà leurs mesures. Rien d’autre ne quitte votre réseau. Les dernières mesures, l’historique des dernières 24 heures et ce que les déclencheurs ont déjà annoncé sont gardés dans le volume `/data` de l’intégration : un redémarrage ne déclenche rien deux fois.

## Dépannage

- **Kaiterra a refusé la clé d’API** : recopiez-la depuis app.kaiterra.com (sans espace), puis enregistrez la configuration.
- **Appareil N : Kaiterra ne connaît pas cet identifiant** : vérifiez l’identifiant dans l’appli Kaiterra ; la position N est l’ordre des identifiants dans la configuration.
- **Appareil N : il appartient à une organisation dont cette clé ne fait pas partie** : créez la clé avec un compte de cette organisation.
- **Pas un identifiant d’appareil** : un identifiant compte 32 chiffres hexadécimaux ; un nom ou un numéro de série n’en est pas un.
- **Un appareil semble hors ligne** : il n’a rien envoyé depuis 15 minutes. Vérifiez son alimentation et son Wi-Fi dans l’appli Kaiterra.
- **Toujours bloqué** : appuyez sur **Diagnostic**, puis ouvrez une issue sur [GitHub](https://github.com/William-De71/gladys-kaiterra/issues) avec les versions de Gladys et de l’intégration, et les lignes « Kaiterra diagnostic » des journaux (ajoutez `DEBUG=gladys-integration-sdk` en mode développeur).

Données fournies par Kaiterra. Cette intégration communautaire n’est pas affiliée à Kaiterra.
