# k8s infrastructure

## Introduction

This repository contains the infrastructure configuration for my Kubernetes cluster, including all the manifests and documentation.

```mermaid
flowchart LR
    Internet(["Internet"])

    subgraph BHS["Beauharnois, Canada"]
        DED["<b>Worker Node</b><br/>apps and their data<br/><small>8 threads<br/>64 GB RAM<br/>2×8 TB HDD</small><br/>"]
        VPS["<b>VPS</b><br/>control plane<br/><small>2 vCPU<br/>4 GB RAM<br/>40 GB NVMe</small><br/>"]
    end

    subgraph TOR["Toronto, Canada"]
        S3[("<b>OVH Object Storage</b><br/>backups<br/>")]
    end

    Internet -->|HTTPS| DED
    DED <-->|WireGuard tunnel| VPS
    DED -->|nightly| S3
```

This cluster hosts personal services as well as client projects from my freelance business. All applications run on the main worker node, while the control plane runs on a separate VPS. This allows the worker node to be replaced without rebuilding the cluster, while the control plane’s NVMe storage keeps etcd fast. The cost of this setup at OVH is roughly $60/month.

### 🦙 Acknowledgment

[Sylvain Nérisson](https://people.epfl.ch/sylvain.nerisson) gave so much of his time to help me make the right design choices for this cluster, for which I’m incredibly grateful.

## 🚀 Apps

What do I host on this cluster?

* **Pro**: This namespace is for all the services hosted for me as a freelancer, such as Umami, HasteServer, Blog, DDPE, Diswho, Instaddict.
* **Home**: This namespace is for all the services hosted for my personal use such as Vaultwarden, TimeTagger, Immich, Monica, Mealie, FileBrowser.
* **Managed**: This namespace is for all the services hosted for my clients.
* **Sushiflix**: This namespace is for all media services such as Plex, Radarr, Sonarr, Bazarr, Jackett, Qbittorrent, Sabnzbd, Tautulli, Overseerr.
* **DB**: This namespace is for all the databases such as PostgreSQL, PgAdmin4.
* **Workflows**: This namespace is for all the workflows such as Harbor.
* **Monitoring**: This namespace is for all the monitoring services such as Grafana, Prometheus, Alertgram, Promtail and Loki.

## 📜 Wiki


### Backups

- 1 local snapshot of each volume every 30 minutes. Retained for 24 hours.
- 1 offsite backup (S3) of each volume every night. Retained for 30 days.
- 1 `pg_dump` of every Postgres database every night ([below](#postgres-backups)). Retained for 30 days.

Movies and TV shows are not backed up, considered as non-critical data.

### Postgres backups

On top of the Longhorn backups of its volume, a [CronJob](./cluster-manifests/db/postgres/pgdump-cronjob.yaml) dumps every database and the roles at 03:30 UTC, encrypts them with rclone crypt and uploads them to the OVH bucket `pgdumps` (Toronto). A dump restores one database alone, and into a newer Postgres.

Set up once: the bucket, owned by `backups-admin` (its key only in the password manager), with a 30-day compliance object lock and an expiry rule at 31 days (S3 API only); the user `pgdumps-upload`, allowed only `s3:PutObject` on `pgdumps/*`; `s3:GetObject` on `pgdumps/*` for `backups-admin` (OVH gives each object to the user that uploaded it: the bucket owner can only list them); and the Secret `pgdump-secrets` in `db`, [sealed](#sealed-secrets) like the others. Keep both crypt passwords in the password manager: without them the dumps can't be read.

```yaml
stringData:
  RCLONE_CONFIG_OVH_ACCESS_KEY_ID: …
  RCLONE_CONFIG_OVH_SECRET_ACCESS_KEY: …
  RCLONE_CONFIG_PGDUMPS_PASSWORD: …    # output of: rclone obscure '<password>'
  RCLONE_CONFIG_PGDUMPS_PASSWORD2: …   # output of: rclone obscure '<salt>'
```

Restore a database from the Mac (`brew install rclone`, the `RCLONE_CONFIG_*` variables of the CronJob, and the `backups-admin` key):

```sh
rclone lsd pgdumps:
rclone copy pgdumps:<date>/<db>.dump .
k -n db cp <db>.dump <postgres pod>:/tmp/
k -n db exec <postgres pod> -- pg_restore -U postgres --clean --if-exists -d <db> /tmp/<db>.dump   # replaces its content
```

### Admin access

`kubectl`, `helm`, `k9s` and `argocd` run on my laptop. The API server only listens on the WireGuard link (`10.8.0.1:6443`), so [`admin/k8s.zsh`](./admin/k8s.zsh) opens an SSH tunnel to the VPS whenever a command needs it (local port 16443) and uses its own kubeconfig, `~/.kube/k8s-infrastructure.yaml`. `kubectl port-forward` then opens ports on the Mac directly.

```sh
brew install kubernetes-cli helm kubeseal argocd
echo "source $PWD/admin/k8s.zsh" >> ~/.zshenv && source ~/.zshenv
k8s-login # personal admin certificate signed by the cluster CA, valid 1 year: run again to renew
k get pods -A
argocd app sync <app>   # ArgoCD in core mode: no ArgoCD login, same certificate
```

The certificate is named after the laptop user (`CN=$USER`, no group) and gets its rights from its own binding, created once per person. Kubernetes can't revoke a certificate: deleting the binding cuts off a lost laptop without touching the control plane's `admin.conf`.

```sh
ssh -i ~/.ssh/mbp2024 debian@148.113.245.134 "sudo kubectl --kubeconfig /etc/kubernetes/admin.conf create clusterrolebinding admin-$USER --clusterrole=cluster-admin --user=$USER"
k delete clusterrolebinding admin-<user>   # revoke
```

### Postgres roles

Each app in the shared `db/postgresql` connects with its own role, scoped to its own database(s). Never use the `postgres` superuser from a workload.

| Role        | Used by |
|-------------|---------|
| `bots`      | All `managed/*` Discord bots |
| `haste`     | `pro/haste-server` |
| `umami`     | `pro/umami-analytics` |
| `monica`    | `home/monica` |
| `shlink`    | `home/shlink` |
| `paperless` | `home/paperless` |
| `bonds`     | `home/bonds` |

### Sealed secrets

Secrets are committed encrypted with the controller's public key, [`sealed-secrets.crt`](./sealed-secrets.crt). Write a plain `Secret` in `secrets.yaml` (gitignored) with its `namespace` set, since the sealed version only opens there, then seal it:

```sh
kubeseal --scope namespace-wide --cert "$(git rev-parse --show-toplevel)/sealed-secrets.crt" -o yaml < secrets.yaml > sealed-secrets.yaml
```

Onechart's `sealedFileSecrets` take a raw value, sealed `cluster-wide`:

```sh
kubeseal --scope cluster-wide --cert "$(git rev-parse --show-toplevel)/sealed-secrets.crt" --raw --from-file=config.json
```

The private key only exists in the cluster (`kube-system/sealed-secrets-customkeys`) and in etcd snapshots, so keep a copy outside: without it, a rebuilt cluster can't open any secret in git. Export every key the controller holds (mode 600, never in the repo):

```sh
(umask 077; kubectl -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key -o json | jq '{apiVersion: "v1", kind: "List", items: [.items[] | {apiVersion, kind, type, data, metadata: {name: .metadata.name, namespace: .metadata.namespace, labels: .metadata.labels}}]}' > ~/cluster-backup/sealed-secrets-keys-$(date +%F).json)
```

Reading a secret back: `kubeseal --recovery-unseal --recovery-private-key ~/cluster-backup/sealed-secrets-keys-<date>.json -o yaml < sealed-secrets.yaml`.

### Port forward (to a service or a pod)

```sh
kubectl -n somenamespace port-forward svc/someservice host-port:cluster-port`
```

### Internal-only services (port-forward to access)

Cluster-admin and DB-direct services that stay off the public internet. Port-forward them locally to access:

| Service | URL after forwarding | Command |
|---|---|---|
| Argo CD | http://localhost:8080 | `kubectl -n argocd port-forward svc/argocd-server 8080:80` |
| pgAdmin | http://localhost:8081 | `kubectl -n db port-forward svc/pgadmin-pgadmin4 8081:80` |

### Enter a pod

```sh
kubectl -n somenamespace exec --stdin --tty somepod -- /bin/bash
```

### Preview manifests created by Helm charts

```sh
helm template my-app repo-url/app -f values.yaml
```

Same for a `kustomization.yaml`. kubectl's kustomize still expects Helm 3 (it calls a flag Helm 4 removed), so point it at one. The onechart apps read the chart and its shared values from [`charts/`](./charts), outside their folder, hence the load restrictor (ArgoCD runs with the same options):

```sh
brew install helm@3   # once, next to Helm 4
kubectl kustomize --enable-helm --load-restrictor LoadRestrictionsNone --helm-command "$(brew --prefix helm@3)/bin/helm" .
```

`charts/onechart` is onechart 0.70.0, vendored from [gimlet-io/onechart](https://github.com/gimlet-io/onechart/tree/v0.70.0/charts/onechart) (Apache-2.0, archived; its Helm repository is gone). [`charts/onechart-common-values.yaml`](./charts/onechart-common-values.yaml) holds what the apps share; each `kustomization.yaml` only keeps its own values.

#### Disable backups for a specific volume

By default longhorn backups all volumes. Sometimes, for movies or other non-critical data, we don't want to backup the volume. In that case, you should add these labels to the volume:

```sh
labels:
    recurring-job-group.longhorn.io/nobackup: enabled
    recurring-job.longhorn.io/source: enabled
```

### Expand a Longhorn volume

Use port forwarding to access the Longhorn UI. ⚠️ First, sync the new PVC with Argo before expanding on Longhorn UI (or you will get a sync failed - `Forbidden: field can not be less than previous value`). Then delete all deployments using the volume. Then expand it via Longhorn UI.

### Add a TimeTagger user

Generate a `user:hash` pair on <https://timetagger.app/cred>. ⚠️ The page escapes `$` as `$$` for docker-compose: use a single `$` here (`$2a$08$...`, 60 characters), or the login fails.

Append it (comma-separated) to `TIMETAGGER_CREDENTIALS` in `cluster-manifests/home/timetagger/secrets.yaml`, [seal the secret](#sealed-secrets), merge, then restart the pod once ArgoCD has synced (env vars are only read at startup):

```sh
kubectl -n home rollout restart deploy/timetagger
```

### Setup Sushiflix

The Plex server has to be accessed locally to be claimed. Use port forwarding to access it first. Then we need to specify the custom domain name in the server network settings (advanced), and specify `plex.androz2091.fr`. Otherwise it will try to load data from `server-ip:32400` or even `cluster-ip:32400` which is not securely accessible.

### View logs

Logs are collected by Promtail/Loki and can be access via the dashboard available at [grafana/loki-dashboard.json](./grafana/loki-dashboard.json).

⚠️ Onechart labels all its apps with `onechart` so we have to differentiate them using the `instance` label.

## ⚒️ Setup

### Create the k8s cluster

```sh
apt update && sudo apt upgrade -y
apt-get install -y software-properties-common curl jq
```

Turn off swap.

```sh
swapoff -a   # Ansible then comments the swap lines out of /etc/fstab, so it stays off after a reboot
```

Prepare the node with Ansible. Always `--check --diff` first. Tasks are idempotent so a second run must report `changed=0`.

```sh
brew install ansible
ansible -i ansible/inventory.ini all -m ping 
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --check --diff
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --diff
```

Create the cluster from [`kubeadm/cluster-config.yaml`](./kubeadm/cluster-config.yaml), copied to the node first. It is the configuration the cluster stores in its `kubeadm-config` ConfigMap, keep the two identical. Each node then gets its own `/24` of the pod network `10.244.0.0/16`.

```sh
kubeadm init --config cluster-config.yaml --upload-certs
```

Configure kubectl CLI to connect to the cluster.

```sh
export KUBECONFIG=/etc/kubernetes/admin.conf
```

To add a node, run the playbook on it, then `kubeadm join` it with a fresh token from the control plane (`kubeadm token create --print-join-command`). A new control plane node only gets its taint at the end of the join: clean up the DaemonSet pods that landed on it meanwhile.

### Install a CNI plugin

Flannel gives each pod an IP and carries pod traffic between the nodes. Same version as the cluster, then pointed at the WireGuard tunnel (it takes the MTU from `wg0` by itself: 1370):

```sh
kubectl apply -f https://github.com/flannel-io/flannel/releases/download/v0.25.6/kube-flannel.yml
kubectl -n kube-flannel patch ds kube-flannel-ds --type=json -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--iface=wg0"}]'
```

### Install Caddy

Caddy takes the public traffic on `ns561436` and proxies each site to its Service (`*.svc.cluster.local`, resolved by CoreDNS through the host's DNS). Its apt repository, once:

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

The playbook installs it, puts the repo's [`Caddyfile`](./Caddyfile) in `/etc/caddy` (validated first) and runs `caddy.service`, which reloads on change. After editing the `Caddyfile`:

```sh
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --tags caddy --diff
```

### Install Sealed Secrets

```sh
helm repo add sealed-secrets https://bitnami.github.io/sealed-secrets
helm repo update
helm install sealed-secrets sealed-secrets/sealed-secrets --namespace kube-system --create-namespace --version 2.16.1
```

The secrets in git only open with the existing key (public half: [`sealed-secrets.crt`](./sealed-secrets.crt)). Restore the [backup](#sealed-secrets), then restart the controller so it loads it:

```sh
kubectl apply -f ~/cluster-backup/sealed-secrets-keys-<date>.json
kubectl -n kube-system rollout restart deploy/sealed-secrets
```

A brand-new key is only for a cluster with no secret yet: [bring your own certificate](https://github.com/bitnami-labs/sealed-secrets/blob/main/docs/bring-your-own-certificates.md), label it `sealedsecrets.bitnami.com/sealed-secrets-key=active` and commit its public half as `sealed-secrets.crt`.

### Install ArgoCD

```sh
kubectl create namespace argocd
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm install argocd argo/argo-cd --namespace argocd --create-namespace --values https://raw.githubusercontent.com/Androz2091/k8s-infrastructure/main/argocd-values.yaml --version 9.5.14
```

Get ArgoCD password.

```sh
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

### Install Longhorn

```sh
apt-get install open-iscsi -y
helm repo add longhorn https://charts.longhorn.io
helm repo update
helm install longhorn longhorn/longhorn --namespace longhorn-system --create-namespace --version 1.7.3 --set persistence.defaultClassReplicaCount=1
```

`defaultClassReplicaCount=1`: one node, so one copy per volume (the chart default is 3). Upgraded from 1.7.0 on 2026-09-27, mainly for the fix of a CSI race that could reformat a volume on mount (longhorn#10416). The volumes' engines were left on 1.7.0. There is no downgrade, and `--reuse-values` would keep the old images:

```sh
helm repo update longhorn
helm upgrade longhorn longhorn/longhorn --namespace longhorn-system --version 1.7.3 --set persistence.defaultClassReplicaCount=1 --timeout 15m
```

(optional) forward the Longhorn UI to the host.

```sh
kubectl -n longhorn-system port-forward svc/longhorn-frontend 8080:80
```

Longhorn keeps every volume in `/var/lib/longhorn` on the node, so that disk is the cluster's storage.

### Execute bootstrap application

```sh
kubectl apply -f https://raw.githubusercontent.com/Androz2091/k8s-infrastructure/main/bootstrap-app.yaml
```

### Use k8s cluster DNS on the host

Disable `systemd-resolved` if it's running.

```sh
sudo systemctl disable systemd-resolved.service
sudo systemctl stop systemd-resolved.service
mv /etc/resolv.conf /etc/resolv.conf.bak
```

* update `/etc/resolv.conf` as follows (CoreDNS first: the resolver only tries the next server on a timeout, not on "no such name"):
```sh
nameserver 10.96.0.10
nameserver 8.8.8.8
```

Now we also need to update the cluster DNS so it does not loop back to the host.

* dump the current CoreDNS config:
```sh
kubectl -n kube-system get configmap coredns -o yaml > coredns_patched_dns.yaml
```

* edit the `coredns_patched_dns.yaml` file and add the following line to the `Corefile`:
```
forward . 1.1.1.1 8.8.8.8 {
	max_concurrent 1000
}
```

* then apply the changes by running:
```sh
kubectl apply -f coredns_patched_dns.yaml
```

### Create a secret to pull from Harbor

Do not forget the `\` before the `$` in the username.

```sh
kubectl -n managed create secret docker-registry regcred --docker-server=harbor.androz2091.fr --docker-username="robot\$name" --docker-password="secret_token"
```

### Configure Longhorn backups (OVH Object Storage)

Longhorn UI > `Settings` > `Backup Target`: `s3://longhornbackups@ca-east-tor/` (bucket `longhornbackups`, OVH region Toronto), credential secret `s3-secret`:

```sh
kubectl -n longhorn-system create secret generic s3-secret --from-literal=AWS_ACCESS_KEY_ID=<access_key> --from-literal=AWS_SECRET_ACCESS_KEY=<secret_key> --from-literal=AWS_ENDPOINTS=https://s3.ca-east-tor.io.cloud.ovh.net/ --from-literal=VIRTUAL_HOSTED_STYLE=true
```

A **snapshot** is the state of a volume at a point in time, stored in the cluster. A **backup** is a snapshot copied out of the cluster, to the backup target.

### Reboot a node

kubelet's own configuration is the cluster's `kubelet-config` ConfigMap, mirrored in [`kubeadm/kubelet-config.yaml`](./kubeadm/kubelet-config.yaml). On a shutdown it stops the pods by priority (apps, then Longhorn, then the network), so a plain reboot is clean: the apps come back by themselves, Caddy too (`caddy.service`). After changing the file:

```sh
kubectl -n kube-system patch cm kubelet-config --type merge -p "$(jq -n --rawfile k kubeadm/kubelet-config.yaml '{data: {kubelet: $k}}')"
sudo kubeadm upgrade node phase kubelet-config && sudo systemctl restart kubelet   # on each node; running pods stay
systemd-inhibit --list | grep kubelet   # "shutdown … delay": the lock that makes a reboot wait for the pods
```

After a restart of `ns561436` (2026-11-01: about 45 min until every app was back on the HDDs):
- **The `backup-*-pod`s** are bare Pods and don't come back: `argocd app sync <app> --resource :Pod:<pod>` (filebrowser, immich, paperless).
- **CoreDNS** moves to the VPS while `ns561436` is down. Until #130 is applied, it can't reach the API there and the whole cluster loses DNS: `kubectl cordon vps-ab240c42` before a reboot, `uncordon` after.
- **Plex** once came back hung (no HTTP, even inside its pod): `kubectl -n sushiflix delete pod -l app=plex`.

### Control Plane Node

Since 2026-09-27 the control plane runs on the VPS and `ns561436` is a plain worker. The nodes are set up by [`ansible/bootstrap.yaml`](./ansible/bootstrap.yaml), the cluster by [`kubeadm/cluster-config.yaml`](./kubeadm/cluster-config.yaml). Migration log: [README at `3cffd9d`](https://github.com/Androz2091/k8s-infrastructure/blob/3cffd9d/README.md#control-plane-node).

What the playbook doesn't do:

- each node's WireGuard key pair, generated once on the node (the public key goes in the inventory);
- restarting kube-proxy after `k8s_api_address` changes;
- starting the apps in small batches after a full restart (the HDDs saturate). Don't fully sync `immich` to restart its backup pod: the chart regenerates its Postgres password.


### Upgrade Kubernetes

One minor version per hop (kubeadm can't skip one), control plane first. Set the playbook's `vars:` to the next minor (CRI-O follows Kubernetes' minor; `pause_image` is the kubeadm minor's) and `kubernetesVersion` in `kubeadm/cluster-config.yaml`, then:

```sh
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --tags repos --diff   # the new apt repositories only
# VPS: kubeadm first, then the control plane (1-3 min without API). Cordoned meanwhile, so the CoreDNS
# that kubeadm re-applies stays on ns561436 (its pods can't reach the API from the VPS before #130)
kubectl cordon vps-ab240c42
sudo apt-mark unhold kubeadm && sudo apt-get update && sudo apt-get install -y kubeadm=$K && sudo apt-mark hold kubeadm
sudo kubeadm upgrade plan && sudo kubeadm upgrade apply v${K%-*} -y
# ns561436: kubeadm, then its kubelet config
sudo apt-mark unhold kubeadm && sudo apt-get update && sudo apt-get install -y kubeadm=$K && sudo apt-mark hold kubeadm && sudo kubeadm upgrade node
# each node, VPS first
sudo apt-mark unhold cri-o kubelet kubectl && sudo apt-get install -y -o Dpkg::Options::=--force-confold cri-o=$C kubelet=$K kubectl=$K && sudo apt-mark hold cri-o kubelet kubectl
sudo systemctl daemon-reload && sudo systemctl restart crio kubelet
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --diff                # converges the rest; a second run: changed=0
```

Restarting CRI-O and kubelet on the same version leaves the running containers alone (each container's `conmon` lives outside `crio.service`'s cgroup). **A new CRI-O minor restarts every container on the node:**
- installing the package restarts `crio` by itself (the old package's `postrm`), so `apt-get install` is already the switch
- the new minor removes the old pod sandboxes at start, and kubelet recreates them all

The containers get a normal stop (Postgres shut down cleanly on 2026-11-01), and the apps take about 10 minutes to come back. So on `ns561436`, install CRI-O in a quiet hour. Then `kubectl uncordon vps-ab240c42`.

### Troubleshooting

#### Prometheus KubeClientCertificateExpiration

A client certificate used against the API server expires soon. kubeadm's own certificates last 1 year: check and renew them on the VPS, then restart the control plane pods so they load the new ones (the renewal restarts nothing, e.g. move their manifests out of `/etc/kubernetes/manifests` and back). kubelet renews its own certificate by itself; your admin certificate is renewed with `k8s-login`.

```sh
sudo kubeadm certs check-expiration
sudo kubeadm certs renew all
```

#### OpenSSL error

Understand why sometimes requests are terminated by a SSL error (1/5 requests for some services):
```sh
poca@localhost:~ (1) $ curl https://tautulli.androz2091.fr
curl: (35) OpenSSL/1.1.1l-fips: error:14094438:SSL routines:ssl3_read_bytes:tlsv1 alert internal error
```

Double check the `Caddyfile` and make sure that all the DNS are configured to the correct IP (sometimes when a SSL certificate fails to create/renew, such errors can occur **for all domains**).

Also... double check that `Caddy` is not started twice (see https://serverfault.com/questions/1167816/openssl-routinesssl3-read-bytestlsv1-alert-internal-error-with-kubernetes-and/1168625#1168625).

#### fsnotify watcher error

`kubectl logs -f` failing with `failed to create fsnotify watcher: too many open files` means the node ran out of inotify instances (Debian allows 128 per user, shared by every container running as that user). The playbook raises the limits on every node (`--tags kernel`).
