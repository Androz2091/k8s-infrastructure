# k8s infrastructure

Useful commands:

* `kubeseal --scope namespace-wide --cert ../../../sealed-secrets.crt -o yaml < secrets.yaml > sealed-secrets.yaml`

### Changer le DNS

### Se co à la db dans PgAdmin

Ajouter `postgresql.db.svc.cluster.local`

## Namespaces

### Managed

This namespace is for all the services hosted for my customers (mainly Discord bots but also websites, APIs, etc.).

* 10 Mans Discord Bot
* Androz Development Bot
* Blockfella Discord Bot
* Discordsopli Discord Bot
* CustomGPT Discord Bot
* Evolution Markets Discord Bot
* Fractal Markets Discord Bot
* KOLC Discord Bot
* Kryptview Discord Bot
* Kryptview Community Discord Bot
* Lapiz Legion Discord Bot
* Music Cat Discord Bot
* Netflix Discord Bot
* Pokercode Discord Bot
* Pokercode Quiz Discord Bot
* SimpleTrading Community Discord Bot
* TPFisher Discord Bot
* WhatIsLife Discord Bot
* Wheel Discord Bot

### Pro

This namespace is for all the services hosted for me as a freelancer.

* Umami
* HasteServer
* Blog
* DDPE
* Diswho
* Instaddict

### ManageInvite

* ManageInvite API
* ManageInvite Dashboard
* ManageInvite Bot

### Home

* Vaultwarden ✅
* TimeTagger ✅
* Immich
* Monica
* Mealie
* FileBrowser ✅

### Dumpus

⚠️ requires extra network isolation for security reasons ⚠️  
how to do so...?

* Dumpus API
* some Dumpus workers (can we make it auto scale?)

### Nextcloud

This namespace is for all the services related to Nextcloud.

### Sushiflix

This namespace is for all media services.

* Plex
* Radarr
* Sonarr
* Bazarr
* Jackett
* Qbittorrent
* Sabnzbd
* Tautulli
* Overseerr
