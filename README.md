# k8s infrastructure

## Introduction

This repository contains the infrastructure configuration for my Kubernetes cluster, including all the manifests and documentation.

Table of contents:
* [🚀 Apps](#-Apps)
* [📜 Wiki](#-Wiki)
* [⚒️ Setup](#-Setup)

### 🦙 Sylvain

Even with all this documentation, your only possible solution to fix a deployment issue may be to ask Sylvain for help. Your best hope is probably to find him at AGEPOLY late enough in the evening so that he's not 100% busy, but also just before he starts playing babyfoot. This requires a good sense of timing.

### 🚧 One day...

Because nothing is ever perfect, here is a list of things that need to be done. Sorted by priority.

* setup pgbackrest for critical databases backups.
* understand how to apply values from a `common.yaml` file to several `kustomization.yaml` files.
* use more config maps instead of config PVCs.

## 🚀 Apps

* **Pro**: This namespace is for all the services hosted for me as a freelancer, such as Umami, HasteServer, Blog, DDPE, Diswho, Instaddict.
* **Home**: This namespace is for all the services hosted for my personal use such as Vaultwarden, TimeTagger, Immich, Monica, Mealie, FileBrowser.
* **Managed**: This namespace is for all the services hosted for my clients.
* **Sushiflix**: This namespace is for all media services such as Plex, Radarr, Sonarr, Bazarr, Jackett, Qbittorrent, Sabnzbd, Tautulli, Overseerr.
* **DB**: This namespace is for all the databases such as PostgreSQL, PgAdmin4.
* **Workflows**: This namespace is for all the workflows such as Harbor.
* **Monitoring**: This namespace is for all the monitoring services such as Grafana, Prometheus, Alertgram, Promtail and Loki.
* **Backups**: One snapshot of each volume is taken every 30 minutes, and a backup is sent to a S3 bucket every night. The retention policy is 7 days for snapshots and 30 days for off-site backups. Movies and TV shows are not backed up, considered as non-critical data.

## 📜 Wiki

### Admin access

`kubectl`, `helm` and `k9s` run on the Mac. The API server only listens on the WireGuard link (`10.8.0.1:6443`), so [`admin/k8s.zsh`](./admin/k8s.zsh) opens an SSH tunnel to the VPS whenever a command needs it (local port 16443) and uses its own kubeconfig, `~/.kube/k8s-infrastructure.yaml`. `kubectl port-forward` then opens ports on the Mac directly.

```sh
echo "source $PWD/admin/k8s.zsh" >> ~/.zshenv && source ~/.zshenv   # once, from the repo folder (.zshenv: every zsh, scripts included)
k8s-login                  # personal admin certificate signed by the cluster CA, valid 1 year: run again to renew
k get pods -A              # k = kubectl; k8s-tunnel up | down | status
```

The certificate is named after the Mac user (`CN=$USER`, no group) and gets its rights from its own binding, created once per person. Kubernetes can't revoke a certificate: deleting the binding cuts off a lost laptop without touching the control plane's `admin.conf`.

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

### Create a new sealed secret

Create a new secret (the simplest way is to use `stringData`).

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-app-secret
  namespace: {NAMESPACE_NAME} # IMPORTANT
type: Opaque
stringData:
  username: martin007
  password: mOnSuper1M0t2pass
  code-secret: "1234 5678 9101"
```

Encrypt the secret.

```sh
kubeseal --scope namespace-wide --cert https://raw.githubusercontent.com/Androz2091/k8s-infrastructure/main/sealed-secrets.crt -o yaml < secrets.yaml > sealed-secrets.yaml
```

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

Same applies for `kustomization.yaml` files:

```sh
kubectl kustomize --enable-helm .
```

#### Disable backups for a specific volume

By default longhorn backups all volumes. Sometimes, for movies or other non-critical data, we don't want to backup the volume. In that case, you should add these labels to the volume:

```sh
labels:
    recurring-job-group.longhorn.io/nobackup: enabled
    recurring-job.longhorn.io/source: enabled
```

### Expand a Longhorn volume

Use port forwarding to access the Longhorn UI. ⚠️ First, sync the new PVC with Argo before expanding on Longhorn UI (or you will get a sync failed - `Forbidden: field can not be less than previous value`). Then delete all deployments using the volume. Then expand it via Longhorn UI.

### Seal a secret

From a `secrets.yaml` file:

```sh
kubeseal --scope namespace-wide --cert ../../../sealed-secrets.crt -o yaml < secrets.yaml > sealed-secrets.yaml
```

Raw from a file:

```sh
kubeseal --scope namespace-wide --cert ../../../sealed-secrets.crt --raw --from-file=config.json
```

⚠️ Onechart does not support `--scope namespace-wide` yet, make sure to use `cluster-wide` instead when using `sealedFileSecrets`.

### Unseal a secret

```sh
kubeseal --recovery-unseal --recovery-private-key ~/private.key -o yaml < sealed-secrets.yaml
```

### Upgrade Umami

Umami runs Prisma migrations on container startup. Long data backfills (such as `09_update_hostname_region` which copies hostname from `session` to `website_event`) can be killed by the startup probe, leaving `_prisma_migrations` rows marked failed and a partially applied schema. Future Prisma startups then refuse to proceed with error `P3009`.

Before bumping the chart, scale the deployment to 0 and run any data-heavy migration as a one-shot pod so it cannot be killed by probes:

```sh
kubectl -n pro scale deploy umami-analytics --replicas=0
DB_URL=$(kubectl -n pro get secret umami-analytics-secrets -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
kubectl run umami-migrate --rm -it -n pro \
  --image=ghcr.io/umami-software/umami:postgresql-vX.Y.Z \
  --restart=Never --env="DATABASE_URL=$DB_URL" \
  --command -- npx prisma migrate deploy
kubectl -n pro scale deploy umami-analytics --replicas=1
```

If a previous attempt left a failed migration, inspect schema state by hand (columns, indexes, `_prisma_migrations` rows), finish any missing SQL manually, then mark the migration applied with `npx prisma migrate resolve --applied <migration_name>` from the same one-shot pod.

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
swapoff -a
systemctl mask dev-sdb?.swap && systemctl stop dev-sdb?.swap # Debian special, check dans htop`
```

Prepare the node with Ansible: SSH hardening, host firewall, kernel modules and sysctl, WireGuard link, the `api.k8s.internal` name, kubelet on the tunnel address, CRI-O and Kubernetes (versions pinned in the playbook's `vars`, packages held). It stops **before** `kubeadm init/join`; Kubernetes + ArgoCD own everything in-cluster. [`ansible/inventory.ini`](./ansible/inventory.ini) lists the machines; [`ansible/bootstrap.yaml`](./ansible/bootstrap.yaml) runs on **all** of them, production included (`--limit <host>` for one), and refuses to run if swap is on. Always `--check --diff` first. Tasks are idempotent: a second run must report `changed=0`.

```sh
brew install ansible
ansible -i ansible/inventory.ini all -m ping                                              # SSH + Python ok?
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --check --diff           # dry run, changes nothing
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --diff                   # bare Debian 12 -> ready node
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --limit apps --diff      # one host or group
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --tags firewall --diff   # one step: ssh | firewall | kernel | wireguard | hosts | packages | kubelet
```

`ns561436` was built by hand with the equivalent commands (see this file's git history) and brought under the playbook on 2026-09-21. Done by hand first, because Ansible's apt tasks fail on any broken source (`apt-get` only warns): the old `kubernetes.list`/`cri-o.list` with their keyrings (the same repo declared twice with different keys is an apt error) and the dead Helm repo (`baltocdn.com`, retired in 2025) were moved to `/root/apt-legacy/`, and `apt-mark manual conntrack ebtables` keeps `apt autoremove` away from them.

Create the cluster from [`kubeadm/cluster-config.yaml`](./kubeadm/cluster-config.yaml), copied to the node first. It is the configuration the cluster stores in its `kubeadm-config` ConfigMap: keep the two identical. Each node then gets its own `/24` of the pod network `10.244.0.0/16`.

```sh
kubeadm init --config cluster-config.yaml --upload-certs
```

Configure kubectl CLI to connect to the cluster.

```sh
export KUBECONFIG=/etc/kubernetes/admin.conf
```

Single-node cluster only: let the control plane run apps too. The VPS control plane keeps its taint.

```sh
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

Add a node, once the playbook has run on it. kubeadm writes its certificates and kubeconfigs from the cluster's stored configuration, so they already use `api.k8s.internal`. Nothing needs to be stored: a join token lasts 24 h, a certificate key 2 h.

```sh
kubeadm token create --print-join-command --ttl 1h   # on the control plane; run what it prints on the new node
kubeadm init phase upload-certs --upload-certs       # control-plane nodes only: prints the certificate key
# control-plane node: append --control-plane --certificate-key <key> --apiserver-advertise-address <its wg_address>
kubeadm config images pull --kubernetes-version v1.31.14   # optional, on the new node before joining
```

A new control plane gets its `NoSchedule` taint only at the end of the join, and a taint never evicts: delete the DaemonSet pods that landed on it meanwhile (`kubectl -n longhorn-system delete pod --field-selector spec.nodeName=<node>`, Longhorn can't run without `open-iscsi`).

### Install a CNI plugin

```sh
kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
```

### Install Caddy

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Start Caddy (execute this command in the directory where the `Caddyfile` is located).

```sh
sudo caddy start
```

### Install Helm

```sh
curl https://baltocdn.com/helm/signing.asc | sudo apt-key add -
sudo apt-get install apt-transport-https --yes
echo "deb https://baltocdn.com/helm/stable/debian/ all main" | sudo tee /etc/apt/sources.list.d/helm-stable-debian.list
sudo apt-get update
sudo apt-get install helm
```

### Install Sealed Secrets

```sh
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm repo update
helm install sealed-secrets sealed-secrets/sealed-secrets --namespace kube-system --create-namespace --version 2.16.1
```

Install the CLI.

```sh
# Fetch the latest sealed-secrets version using GitHub API
KUBESEAL_VERSION=$(curl -s https://api.github.com/repos/bitnami-labs/sealed-secrets/tags | jq -r '.[0].name' | cut -c 2-)

# Check if the version was fetched successfully
if [ -z "$KUBESEAL_VERSION" ]; then
    echo "Failed to fetch the latest KUBESEAL_VERSION"
    exit 1
fi

curl -OL "https://github.com/bitnami-labs/sealed-secrets/releases/download/v${KUBESEAL_VERSION}/kubeseal-${KUBESEAL_VERSION}-linux-amd64.tar.gz"
tar -xvzf kubeseal-${KUBESEAL_VERSION}-linux-amd64.tar.gz kubeseal
sudo install -m 755 kubeseal /usr/local/bin/kubeseal
```

Create a public and private key.

```sh
export PRIVATEKEY="mytls.key"
export PUBLICKEY="mytls.crt"
export NAMESPACE="kube-system"
export SECRETNAME="sealed-secrets-customkeys"
```

⚠️ You may want to change the number of days for the expiration date.
```sh
openssl req -x509 -days 365 -nodes -newkey rsa:4096 -keyout "$PRIVATEKEY" -out "$PUBLICKEY" -subj "/CN=sealed-secret/O=sealed-secret"
```

Create the secret.

```sh
kubectl -n "$NAMESPACE" create secret tls "$SECRETNAME" --cert="$PUBLICKEY" --key="$PRIVATEKEY"
kubectl -n "$NAMESPACE" label secret "$SECRETNAME" sealedsecrets.bitnami.com/sealed-secrets-key=active
```

Delete the sealed-secrets controller pod to refresh the keys.

```sh
kubectl -n "$NAMESPACE" delete pod -l name=sealed-secrets-controller
```

See [bitnami-labs/sealed-secrets](https://github.com/bitnami-labs/sealed-secrets/blob/main/docs/bring-your-own-certificates.md#generate-a-new-rsa-key-pair-certificates).

### Install ArgoCD

```sh
kubectl create namespace argocd
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm install argocd argo/argo-cd --namespace argocd --create-namespace --values https://raw.githubusercontent.com/Androz2091/k8s-infrastructure/main/argocd-values.yaml --version 7.0.0
```

CLI de argo.

```sh
sudo curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64 sudo chmod +x /usr/local/bin/argocd
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
export KUBECONFIG=/etc/kubernetes/admin.conf
helm repo update longhorn
helm upgrade longhorn longhorn/longhorn --namespace longhorn-system --version 1.7.3 --set persistence.defaultClassReplicaCount=1 --timeout 15m
```

(optional) forward the Longhorn UI to the host.

```sh
kubectl -n longhorn-system port-forward svc/longhorn-frontend 8080:80
```

todo /var/lib/longhorn

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

* update `/etc/resolv.conf` as follows:
```sh
nameserver 8.8.8.8
nameserver 10.96.0.10
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

### Configure longhorn backups (blackblaze)

From the Longhorn UI, go to `Settings` > `Backup Target` and add a new target with the following settings:

```sh
s3://<bucket_name>@s3.us-west-004.backblazeb2.com/<path>
```

Create a new secret with the credentials.

```sh
kubectl create secret generic s3-secret --from-literal=AWS_ACCESS_KEY_ID=<access_key> --from-literal=AWS_SECRET_ACCESS_KEY=<secret_key> --from-literal=AWS_ENDPOINTS=s3.us-west-004.backblazeb2.com -n longhorn-system
```

A **snaphost** is the state of a Kubernetes Volume at any given point in time. It's stored in the cluster.
A **backup** is a snapshot that is stored outside of the cluster. It's stored in the backup target (here backblaze).

### Control Plane Node

Since 2026-09-27 the control plane (API server, etcd, scheduler, controller-manager) runs on a small NVMe VPS. Apps and Longhorn storage stay on the dedicated server, now a plain worker.

**Why**: etcd waits for a disk sync (`fdatasync`) on every write and needs p99 < 10 ms. On the HDD RAID1, shared with Longhorn and Loki, it can't get that, so the scheduler and controller-manager lose their leader election and restart (340+ restarts each).

| WAL sync latency | `ns561436` (HDD, 4.5M real etcd syncs over 18 days) | `vps-ab240c42` (NVMe, fio, 2026-09-20) | `vps-ab240c42` (real etcd syncs, first 11 min) |
|---|---|---|---|
| median | 8–16 ms | 0.55 ms | ≤ 1 ms |
| p99 | 128–256 ms | 0.87 ms | 4–8 ms |
| worst | > 8 s (384 times) | 2.8 ms | ≤ 16 ms |

Architecture:

```mermaid
flowchart LR
    Internet -->|"80 / 443 (Caddy)"| DED
    subgraph BHS["OVH Beauharnois (BHS)"]
        VPS["<b>vps-ab240c42</b> (VPS-1)<br/>2 vCPU, 4 GB RAM<br/>disk: 40 GB NVMe<br/>148.113.245.134, wg0 10.8.0.1<br/>control plane + etcd<br/>api.k8s.internal"]
        DED["<b>ns561436</b> (dedicated)<br/>8 threads, 64 GB RAM<br/>disk: 2x8 TB HDD RAID1 (7.3 TB usable)<br/>54.39.102.76, wg0 10.8.0.2<br/>apps + Longhorn storage"]
        VPS <-->|"WireGuard 10.8.0.0/24<br/>udp/51820, 0.55 ms"| DED
    end
    subgraph TOR["OVH Toronto (ca-east-tor)"]
        S3[("Object Storage (S3)<br/>bucket longhornbackups")]
    end
    DED -->|"Longhorn backups<br/>daily 02:00 UTC, keep 30"| S3
```

Progress:

- [x] Order the VPS (OVH VPS-1 2027, Beauharnois, Debian 12, no commitment, 5.39 €/month incl. VAT)
- [x] SSH access with key only
- [x] Check the disk latency
- [x] System updates
- [x] Firewall on the VPS ([`firewall/vps-ab240c42.nft`](./firewall/vps-ab240c42.nft))
- [x] Harden `ns561436`: SSH keys only, public VXLAN 8472 closed ([`firewall/ns561436.nft`](./firewall/ns561436.nft))
- [ ] Full default-drop firewall on `ns561436`
- [x] Kernel modules, CRI-O and Kubernetes packages ([`ansible/bootstrap.yaml`](./ansible/bootstrap.yaml), same versions as `ns561436`, no `kubeadm init`)
- [x] WireGuard link between the two machines ([WireGuard](#wireguard))
- [x] Per-node pod ranges (`ns561436` has `10.244.0.0/24`), node IP and Flannel on the tunnel ([Pod CIDR fix and tunnel switch](#pod-cidr-fix-and-tunnel-switch))
- [x] etcd snapshot, `/etc/kubernetes/pki` backup and rollback plan ([etcd backup and rollback](#etcd-backup-and-rollback)); take a fresh snapshot right before touching etcd
- [x] Stable API endpoint `api.k8s.internal` and API server certificate names ([Stable API endpoint](#stable-api-endpoint))
- [x] Allow the cluster traffic on `wg0` in both firewalls ([Firewall](#firewall))
- [x] Join the VPS as a control plane node, move etcd to it and remove the control plane from `ns561436` ([Move to the VPS](#move-to-the-vps))
- [x] Remove the cluster private keys and admin kubeconfigs from `ns561436`, admin access from the Mac ([ns561436 as a plain worker](#ns561436-as-a-plain-worker))
- [ ] Automatic etcd snapshots on the VPS, Prometheus scraping etcd

#### SSH access

The user is `debian` (passwordless sudo). Host key: `SHA256:ntDgt0UwHZ7QIxj+q6JYZWXBYysPiHcyJ3PnKZ/TlJE` (ED25519).

```sh
ssh -i ~/.ssh/mbp2024 debian@148.113.245.134
```

Done once: log in with the temporary password from the OVH email (it forces a password change) and install the key. The playbook (`--tags ssh`) then turns passwords off on every node with `/etc/ssh/sshd_config.d/00-hardening.conf` (keys only, 20 s to log in, 3 half-open connections per IP).

```sh
ssh-copy-id -i ~/.ssh/mbp2024.pub debian@148.113.245.134
sudo sshd -T | grep -i '^passwordauthentication' # what sshd really enforces: no
```

sshd keeps the FIRST value it reads and OVH's `50-cloud-init.conf` says "yes", so the override must sort before it. `PasswordAuthentication no` in the main `sshd_config` is not enough: `ns561436` was effectively accepting password logins that way until 2026-09-21 (~1000 guesses and ~170 dropped connections per hour, both 0 since).

#### Check the disk latency for etcd

Simulates the etcd write pattern (small writes, each followed by `fdatasync`). Read the `99.00th` value of the `fsync/fdatasync` block: it must be under 10 ms (10000 usec).

```sh
sudo apt-get install -y fio
mkdir -p ~/fio-test && fio --name=etcd-sim --directory=$HOME/fio-test --rw=write --ioengine=sync --fdatasync=1 --size=22m --bs=2300
rm -rf ~/fio-test
```

⚠️ Don't run it on `ns561436`: it competes with etcd for the HDD. Read etcd's own histogram instead (cumulative since etcd started).

```sh
curl -s http://127.0.0.1:2381/metrics | grep etcd_disk_wal_fsync_duration_seconds_bucket
```

#### System updates

`full-upgrade` and not `upgrade`: a new kernel is a new package, which `apt-get upgrade` refuses to install. Debian security patches are then applied automatically by `unattended-upgrades` (it never reboots by itself, and never touches the held Kubernetes packages).

```sh
sudo apt-get update && sudo apt-get -y full-upgrade
sudo reboot # only needed for a new kernel, check with uname -r
```

#### Firewall

Rules are version-controlled under [`firewall/`](./firewall/) (one file per node) so a node rebuild is reproducible. Each node needs the `nftables` package; each file manages only its own table, so it never clears the rules kube-proxy and Flannel install in the same kernel engine (no `flush ruleset`).

Done on both nodes by [the playbook](#create-the-k8s-cluster) (`--tags firewall`), which replaces Debian's default `/etc/nftables.conf` (it starts with `flush ruleset`). By hand it is:

```sh
sudo apt-get install -y nftables
sudo cp firewall/<node>.nft /etc/nftables.conf   # the file for that node
sudo nft -c -f /etc/nftables.conf                # check syntax (no output = ok)
sudo nft -f /etc/nftables.conf                   # apply now (keep your SSH session open)
sudo systemctl enable nftables                   # load at every boot
```

| File | Node | Policy |
|---|---|---|
| `firewall/vps-ab240c42.nft` | control plane VPS | default-drop; allows SSH, ping, DHCP, WireGuard from `ns561436`, everything on `wg0` |
| `firewall/ns561436.nft` | dedicated server | default-accept; drops Flannel's VXLAN (8472) except on `wg0` |

Cluster traffic between the nodes (API 6443, kubelet 10250, etcd, VXLAN 8472) only uses `wg0`, which both firewalls accept in full. `ns561436` stays default-accept for now because it runs production (it no longer listens on the etcd and API ports); a full default-drop firewall is next.

#### WireGuard

Private link between the nodes: `wg0` on `10.8.0.0/24` (VPS `10.8.0.1`, `ns561436` `10.8.0.2`), udp/51820, MTU 1420, ~0.55 ms. The VPS firewall only accepts 51820 from `54.39.102.76`. Since 2026-09-27 `ns561436` announces `10.8.0.2` as its node IP and Flannel runs over `wg0` (pod MTU 1370).

No secret is in this repo. Each node generates its own private key, which never leaves it; public keys and tunnel addresses are host vars in [`ansible/inventory.ini`](./ansible/inventory.ini), and [`ansible/templates/wg0.conf.j2`](./ansible/templates/wg0.conf.j2) makes WireGuard load the private key from its file (`PostUp`), so the config holds no secret either.

```sh
# once per node, as root. Running it again replaces the key and breaks the tunnel.
umask 077; wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
cat /etc/wireguard/publickey   # -> wg_public_key in ansible/inventory.ini

ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --tags "wireguard,firewall" --diff
ping -c 3 10.8.0.2 && sudo wg show wg0   # from the VPS: recent handshake, transfer counters going up
```

#### Stable API endpoint

Everything that must follow the API when it moves reaches it as `api.k8s.internal:6443`: kubectl, kubelet, kube-proxy and nodes that join. The name is a line in `/etc/hosts` on every node (playbook, `--tags hosts`) pointing at `k8s_api_address` in [`ansible/inventory.ini`](./ansible/inventory.ini): `10.8.0.1` (VPS) since the move, `10.8.0.2` (`ns561436`) before. kubeadm knows it as `controlPlaneEndpoint` in [`kubeadm/cluster-config.yaml`](./kubeadm/cluster-config.yaml). The controller-manager and scheduler keep talking to the API server on their own machine. OVH's cloud-init only maintains the `127.0.1.1` line of `/etc/hosts` (`manage_etc_hosts: localhost`), so the extra line survives reboots.

⚠️ kubelet gives host-network pods a copy of `/etc/hosts` taken when the pod starts. After changing `k8s_api_address`, restart kube-proxy (its kubeconfig uses the name), or it keeps dialing the old address: `kubectl -n kube-system rollout restart ds/kube-proxy`.

Done once, on the running cluster, on 2026-09-27 (no downtime; rollback copies in `/root/cluster-backup/*-before-2026-09-27/` on `ns561436`):

```sh
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --tags hosts --diff

# on ns561436, with kubeadm/cluster-config.yaml copied to /root/kubeadm/
# 1. API certificate with the extra names: generated in a scratch dir holding only the CA, checked, then swapped in.
#    The API server reloads its certificate by itself, no restart.
S=/root/kubeadm/pki-new; mkdir -p $S && cp /etc/kubernetes/pki/ca.{crt,key} $S/
sed "s|^certificatesDir: .*|certificatesDir: $S|" /root/kubeadm/cluster-config.yaml > /root/kubeadm/scratch.yaml
kubeadm init phase certs apiserver --config /root/kubeadm/scratch.yaml
openssl x509 -in $S/apiserver.crt -noout -ext subjectAltName && openssl verify -CAfile /etc/kubernetes/pki/ca.crt $S/apiserver.crt
install -m 600 $S/apiserver.key /etc/kubernetes/pki/ && install -m 644 $S/apiserver.crt /etc/kubernetes/pki/ && rm -rf $S /root/kubeadm/scratch.yaml
# 2. kubeadm's stored configuration, and what a joining node reads first
kubeadm init phase upload-config kubeadm --config /root/kubeadm/cluster-config.yaml
kubectl -n kube-public get cm cluster-info -o yaml | sed 's#https://54.39.102.76:6443#https://api.k8s.internal:6443#' | kubectl replace -f -
# 3. clients
sed -i 's#https://54.39.102.76:6443#https://api.k8s.internal:6443#' /etc/kubernetes/{admin,super-admin,kubelet}.conf && systemctl restart kubelet
kubectl -n kube-system get cm kube-proxy -o yaml | sed 's#https://54.39.102.76:6443#https://api.k8s.internal:6443#' | kubectl replace -f -
kubectl -n kube-system rollout restart ds/kube-proxy
```

kubeadm traps: `init phase certs apiserver` silently keeps an existing certificate ("Using existing apiserver certificate"), hence the scratch dir; `--config` can't be combined with `--cert-dir`; `--dry-run` leaves copies of the certificates in `/etc/kubernetes/tmp/kubeadm-init-dryrun*`, delete them.

#### Pod CIDR fix and tunnel switch

Done on 2026-09-27 (apps down 18:34 → 19:07 UTC). The Node object's `podCIDR` can't be edited and `ns561436` owned the whole `10.244.0.0/16`, so the node was registered again: the controller-manager now hands out one `/24` per node, and at the same time the node IP and Flannel moved to the tunnel (every pod restarts once, so none keeps the old MTU). Longhorn 1.7.3 first, volumes detached before touching the node; Longhorn found the same disk and all 36 replicas again. State saved beforehand in `/root/cluster-backup/window-2026-09-27/` on `ns561436`.

```sh
# on ns561436 (KUBECONFIG=/etc/kubernetes/admin.conf); volume-workloads.txt = every Deployment/StatefulSet mounting a PVC
kubectl cordon ns561436
while read kind ns name; do kubectl -n $ns scale $kind/$name --replicas=0; done < volume-workloads.txt   # then wait: all volumes "detached"
kubeadm init phase upload-config kubeadm --config /root/kubeadm/cluster-config.yaml       # podSubnet in kubeadm's stored config
kubeadm init phase control-plane controller-manager --config /root/kubeadm/cluster-config.yaml   # adds --allocate-node-cidrs --cluster-cidr
kubectl -n kube-system get cm kube-proxy -o yaml | sed 's#^    clusterCIDR: ""$#    clusterCIDR: 10.244.0.0/16#' | kubectl replace -f -
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --tags kubelet --diff    # from the Mac: --node-ip=<wg_address>

systemctl stop kubelet && kubectl delete node ns561436    # wait until no pod is bound to the node (~1 min)
kubectl -n kube-flannel patch ds kube-flannel-ds --type=json -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--iface=wg0"}]'
# stop every pod sandbox except etcd, kube-apiserver, kube-controller-manager, kube-scheduler
for p in $(crictl pods -q); do crictl inspectp -o go-template --template '{{.status.metadata.name}}' $p | grep -qE '^(etcd|kube-apiserver|kube-controller-manager|kube-scheduler)-' || { crictl stopp $p; crictl rmp $p; }; done
ip link delete cni0; ip link delete flannel.1; rm -rf /var/lib/cni/networks/* /run/flannel/subnet.env
systemctl start kubelet                                   # node back with podCIDR 10.244.0.0/24, InternalIP 10.8.0.2
kubectl label node ns561436 node-role.kubernetes.io/control-plane= node.kubernetes.io/exclude-from-external-load-balancers=
kubectl annotate node ns561436 kubeadm.alpha.kubernetes.io/cri-socket=unix:///var/run/crio/crio.sock
while read kind ns name; do kubectl -n $ns scale $kind/$name --replicas=1; done < volume-workloads.txt    # Harbor first, then databases, then the rest
```

Lessons: start the apps in small batches (20 at once saturated the HDDs; etcd slowed down and kubelet restarted the API server, ~1 min without API). The `backup-*-pod`s in `home/` (filebrowser, immich, paperless) keep those volumes mounted for the SFTP backups; bring them back with a sync of the pod only: a full sync of `immich` would also rewrite `Secret/immich-postgresql`, whose `postgres-password` the chart regenerates.

#### Move to the VPS

Done on 2026-09-27 (19:46 → 20:20 UTC): the VPS joined as a second control plane, took the etcd leadership, then `ns561436` stopped its control plane and left etcd. One API outage (2 min 35 s, step 1), apps untouched. Replaced files are kept in `/root/cluster-backup/` on `ns561436`. Fresh etcd snapshot before each etcd step ([etcd backup and rollback](#etcd-backup-and-rollback)).

```sh
# etcdctl runs inside an etcd pod (on the VPS: sudo, --kubeconfig=/etc/kubernetes/admin.conf)
E() { kubectl -n kube-system exec etcd-<node> -- etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt --key=/etc/kubernetes/pki/etcd/healthcheck-client.key "$@"; }

# 1. on ns561436: its etcd peer address moves from the public IP (set by kubeadm init in 2024) to the tunnel.
#    New peer certificate = the old names + 10.8.0.2, made in a scratch dir holding only the etcd CA (kubeadm keeps existing certificates).
D=/root/etcd-peer-new; mkdir -m 700 -p $D/etcd && cp /etc/kubernetes/pki/etcd/ca.{crt,key} $D/etcd/
# $D/config.yaml: InitConfiguration (nodeRegistration.name ns561436, localAPIEndpoint.advertiseAddress 54.39.102.76)
#               + ClusterConfiguration (kubernetesVersion, certificatesDir: $D, etcd.local.peerCertSANs: [10.8.0.2])
kubeadm init phase certs etcd-peer --config $D/config.yaml
install -m 644 $D/etcd/peer.crt /etc/kubernetes/pki/etcd/ && install -m 600 $D/etcd/peer.key /etc/kubernetes/pki/etcd/ && rm -rf $D
E member update f3557d7c08b71d2d --peer-urls=https://10.8.0.2:2380
sed -i 's#https://54.39.102.76:2380#https://10.8.0.2:2380#g' /etc/kubernetes/manifests/etcd.yaml   # etcd restarts

# 2. from the Mac: join (see "Add a node"), then remove the Longhorn pods that landed before the taint
JOIN=$(ssh -i ~/.ssh/mbp2024 root@54.39.102.76 'kubeadm token create --print-join-command --ttl 1h')
KEY=$(ssh -i ~/.ssh/mbp2024 root@54.39.102.76 'kubeadm init phase upload-certs --upload-certs --config /root/kubeadm/cluster-config.yaml 2>/dev/null | tail -1')
ssh -i ~/.ssh/mbp2024 debian@148.113.245.134 "sudo $JOIN --control-plane --certificate-key $KEY --apiserver-advertise-address 10.8.0.1"; unset JOIN KEY
kubectl -n longhorn-system delete pod --field-selector spec.nodeName=vps-ab240c42

# 3. handover
E move-leader d3d61204134edca2                   # sent to the leader (ns561436): the VPS leads etcd
# ansible/inventory.ini: k8s_api_address=10.8.0.1
ansible-playbook -i ansible/inventory.ini ansible/bootstrap.yaml --tags hosts --diff
kubectl -n kube-system rollout restart ds/kube-proxy
B=/root/cluster-backup/manifests-ns561436-2026-09-27; mkdir -m 700 -p $B    # on ns561436
mv /etc/kubernetes/manifests/kube-{apiserver,controller-manager,scheduler}.yaml $B/   # the VPS takes both leases, API stays up
E member remove f3557d7c08b71d2d                 # in etcd-vps-ab240c42: etcd is now the VPS alone
mv /etc/kubernetes/manifests/etcd.yaml $B/ && mv /var/lib/etcd /var/lib/etcd.removed-2026-09-27   # once etcd has stopped
kubectl label node ns561436 node-role.kubernetes.io/control-plane- node.kubernetes.io/exclude-from-external-load-balancers-
```

The first join stalled on "can only promote a learner member which is in sync with leader": etcd only accepts a peer connecting from an IP listed in its certificate, and `ns561436`'s etcd was still on its public IP, so neither side matched. Cleanup before trying again: `E member remove <learner id>` and `kubectl cordon` on the cluster side; on the VPS `kubeadm reset -f --skip-phases=remove-etcd-member` (that phase also empties `/var/lib/etcd`: do it by hand), `crictl rmp -fa` if reset times out, `ip link delete cni0` and `flannel.1`; then `kubectl delete node vps-ab240c42` (join refuses a name that is already Ready). On `ns561436`, kubelet took ~2 min to apply any static pod change (etcd itself starts in 2 s).

#### ns561436 as a plain worker

Done on 2026-09-27 after the move. `ns561436` faces the internet, so it keeps only what a joined worker gets: `kubelet.conf` and `pki/ca.crt`. The cluster's private keys (identical on the VPS) and every admin kubeconfig are gone from it; admin access is from the Mac ([Admin access](#admin-access)).

```sh
# on the VPS: no join token left (print only the IDs, the second half of a token is its secret)
for t in $(sudo kubeadm token list | awk 'NR>1{print substr($1,1,6)}'); do sudo kubeadm token delete $t; done
# from the Mac: backups holding keys or Secrets move to the VPS, checked file by file (the postgres dump stays)
ssh -i ~/.ssh/mbp2024 root@54.39.102.76 'cd /root/cluster-backup && find . \( -path ./postgres-2026-09-27 -o -name MOVED.sha256 \) -prune -o -type f -print0 | sort -z | xargs -0 sha256sum > MOVED.sha256 && tar cf - --exclude=./postgres-2026-09-27 .' \
  | ssh -i ~/.ssh/mbp2024 debian@148.113.245.134 'sudo sh -c "mkdir -m 700 -p /root/cluster-backup/from-ns561436 && tar xpf - -C /root/cluster-backup/from-ns561436 && cd /root/cluster-backup/from-ns561436 && sha256sum -c --quiet MOVED.sha256"'
# on ns561436, once the copy is verified (tmp/ = stale kubeadm upgrade backups from May 2026)
cd /root/cluster-backup && ls -A | grep -vx postgres-2026-09-27 | xargs rm -rf -- && rm -rf /etc/kubernetes/tmp
cd /etc/kubernetes && rm -f admin.conf super-admin.conf controller-manager.conf scheduler.conf /home/debian/.kube/config
find pki -type f ! -path pki/ca.crt -delete && find pki -mindepth 1 -type d -empty -delete && systemctl restart kubelet
```

#### etcd backup and rollback

Since the move etcd runs on the VPS: same commands with `etcd-vps-ab240c42`, files in its `/root/cluster-backup` (the ones below in `from-ns561436/`). The rollback below was the plan for the migration and no longer applies.

Taken before any change to `ns561436`. The files hold every Secret in readable form (no encryption at rest) and the cluster CA keys: `chmod 600`, never in this repo. Copies: the VPS (`/root/cluster-backup`, `~/cluster-backup`) and the admin's Mac (`~/cluster-backup`, outside iCloud-synced folders).

```sh
# on ns561436. etcdctl/etcdutl only exist inside the etcd container, which only sees /var/lib/etcd and /etc/kubernetes/pki/etcd
D=$(date +%F); mkdir -p /root/cluster-backup && chmod 700 /root/cluster-backup
ETCD="kubectl --kubeconfig=/etc/kubernetes/admin.conf -n kube-system exec etcd-ns561436 --"
$ETCD etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  snapshot save /var/lib/etcd/snapshot-$D.db
$ETCD etcdutl snapshot status /var/lib/etcd/snapshot-$D.db -w table
mv /var/lib/etcd/snapshot-$D.db /root/cluster-backup/
# certificates, control plane manifests, kubeconfigs (tmp/ = 444 MB of stale kubeadm upgrade backups)
tar czf /root/cluster-backup/etc-kubernetes-$D.tar.gz --exclude=kubernetes/tmp -C /etc kubernetes
cd /root/cluster-backup && chmod 600 *.db *.tar.gz && sha256sum *.db *.tar.gz | tee SHA256SUMS

# from the Mac: copy off the machine, then check every copy (sha256sum -c on Linux)
scp -i ~/.ssh/mbp2024 'root@54.39.102.76:/root/cluster-backup/*' ~/cluster-backup/
scp -i ~/.ssh/mbp2024 ~/cluster-backup/* debian@148.113.245.134:cluster-backup/
shasum -a 256 -c SHA256SUMS
```

Restore test, on the VPS (2026-09-21: 14 namespaces and 3726 keys read back). `etcdutl` must be the cluster's etcd version.

```sh
curl -fsSLO https://github.com/etcd-io/etcd/releases/download/v3.5.24/etcd-v3.5.24-linux-amd64.tar.gz   # check it against the release's SHA256SUMS
tar xzf etcd-v3.5.24-linux-amd64.tar.gz --strip-components=1
./etcdutl snapshot restore ~/cluster-backup/snapshot-2026-09-21.db --data-dir ~/restore-test
./etcd --data-dir ~/restore-test --listen-client-urls http://127.0.0.1:12379 --advertise-client-urls http://127.0.0.1:12379 --listen-peer-urls http://127.0.0.1:12380 &
./etcdctl --endpoints=http://127.0.0.1:12379 get /registry/namespaces/ --prefix --keys-only
kill %1; rm -rf ~/restore-test
```

Rollback on `ns561436` if a migration step breaks etcd. ⚠️ Never run on production so far. Apps keep running meanwhile: kubelet and CRI-O don't need the API server.

```sh
mv /etc/kubernetes/manifests /etc/kubernetes/manifests.off   # kubelet stops etcd, API server, scheduler, controller-manager
crictl ps --name 'etcd|kube-apiserver' -q                     # wait until this prints nothing
mv /var/lib/etcd /var/lib/etcd.broken
etcdutl snapshot restore /root/cluster-backup/snapshot-<date>.db --data-dir /var/lib/etcd \
  --name ns561436 --initial-cluster ns561436=https://54.39.102.76:2380 --initial-advertise-peer-urls https://54.39.102.76:2380
tar xzf /root/cluster-backup/etc-kubernetes-<date>.tar.gz -C /etc   # pki, kubeconfigs and the pre-change manifests: the control plane starts again
kubectl --kubeconfig=/etc/kubernetes/admin.conf get nodes,pods -A
# if the VPS had already joined: kubeadm reset on the VPS (the restored state doesn't know it)
```

### Troubleshooting

#### Prometheus KubeClientCertificateExpiration

This usually happens when the internal Kubernetes API server's certificate is about to expire. You can check the expiration date with the following command: `sudo kubeadm certs check-expiration`.

If it's about to expire, run `sudo kubeadm certs renew all`. Then use `sudo systemctl restart kubelet` to restart the pods!

#### OpenSSL error

Understand why sometimes requests are terminated by a SSL error (1/5 requests for some services):
```sh
poca@localhost:~ (1) $ curl https://tautulli.androz2091.fr
curl: (35) OpenSSL/1.1.1l-fips: error:14094438:SSL routines:ssl3_read_bytes:tlsv1 alert internal error
```

Double check the `Caddyfile` and make sure that all the DNS are configured to the correct IP (sometimes when a SSL certificate fails to create/renew, such errors can occur **for all domains**).

Also... double check that `Caddy` is not started twice (see https://serverfault.com/questions/1167816/openssl-routinesssl3-read-bytestlsv1-alert-internal-error-with-kubernetes-and/1168625#1168625).

### fsnotify watcher error

When running `kubectl logs some-pod` I was getting `failed to create fsnotify watcher: too many open files`. The issue was solved by increasing the number of inotify max user instances. (see https://serverfault.com/questions/984066/too-many-open-files-centos7-already-tried-setting-higher-limits).

```
debian@ns561436:~$ cat /proc/sys/fs/inotify/max_user_watches
524288
debian@ns561436:~$ cat /proc/sys/fs/inotify/max_user_instances
128
```

```
sudo bash -c 'cat <<EOF> /etc/sysctl.d/fs_inotify.conf
fs.inotify.max_user_instances = 1024
fs.inotify.max_user_watches = 1048576
EOF'
```
