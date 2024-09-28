## Terminologie et fonctionnement

Un stanza est utilisé par PgBackRest pour désigner une configuration de sauvegarde. Il permet de définir les paramètres de sauvegarde et de restauration pour un **cluster** postgresql.

Dans pg, un checkpoint est une opération qui force l'écriture des données modifiées de la mémoire (cache) sur le disque. Cela garantit que toutes les modifications apportées à la base de données sont correctement enregistrées et que, en cas de panne, le système peut redémarrer avec un état cohérent.

Les sauvegardes avec pgbackrest ne sont pas déclenchées par pgbackrest lui-même (cron)

Un seul fichier de conf:
`/etc/pgbackrest/pgbackrest.conf`
```conf
[cluster1configsauvegarde]
pg1-path=/var/lib/pgsql/14/data
pg1-port=5432
repo1-path=/var/lib/pgbackrest
# définit combien de sauvegardes de journaux d'archives (WAL) doivent être conservées. Ceci est essentiel pour la restauration point-in-time (PITR).
repo1-retention-archive=3
# nb de sauvegardes incrémentales à conserver
repo1-retention-full=2 # une chaque dimanche ?
repo1-retention-incr=7 # une chaque jour ?
repo1-retention-archive=14
# on stocke le WAL pendant 14 jours, en fait ça le fait déjà (quand une sauvegarde complète expire, alors le WAL associé expire aussi, jusqu'à la prochaine sauvegarde complète disponible - ici chaque backup complète expire toutes les 2 semaines donc le WAL associé est déjà gardé pendant 14 jours)
# mais pgbackrest indique que, pour sauvegarder de l'espace disque, il est possible de réduire la sauvegarde du WAL à 7 jours par ex.

[cluster2configsauvegarde]
pg1-path=/var/lib/pgsql/14/data
pg1-port=5432

# s'applique à tous les stanza
[global]
log-level-console=info
log-level-file=debug
process-max=4
compress-type=gz

[global:archive-push]
archive-async=y # utile pour les multiple repositories (comme ça si un repo fail, le WAL peut être envoyé aux autres quand même)
```

Sauvegarder le WAL en temps réel :

`postgresql.conf`
```conf
archive_mode = on # active l'archivage des journaux WAL
archive_command = 'pgbackrest --stanza=mydb archive-push %p'
archive_timeout = 60 # attention! ils recommandent d'augmenter cette valeur si l'archivage prend plus de 60s (valeur par défaut)

# recommandé sur le wiki pgbackrest
wal_level = replica # le niveau le plus haut pour l'archivage ? logical, minimal sinon
max_wal_senders = 3
```

pgBackRest archive chaque journal WAL au fur et à mesure qu'il est généré, ce qui permet de combiner avec des sauvegardes incrémentielles ou complètes pour avoir une stratégie de récupération point-in-time (PITR).

il faut d'abord une sauvegarde complète puis appliquer les journaux de logs WAL pour arriver à un point dans le temps.

On veut toujours garder le WAL APRÈS la dernière sauvegarde complète sinon ça ne sert à rien ?

## une instance de pgbackrest par cluster ou une instance pour tous ?

### Une instance de pgbackrest par cluster

- \+ plus simple à créer
- \- maintenance plus galère

### Une instance de pgbackrest pour tous les clusters

- \+ moins de ressources utilisées
- \+ moins de maintenance
- \- plus complexe à configurer
- \- how do we access the volumes? (pas le même namespace)
