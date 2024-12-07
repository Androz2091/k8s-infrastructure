# K8S infrastructure

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

* fix `tail: inotify cannot be used, reverting to polling: Too many open files` on the host
* setup pgbackrest for critical databases backups.
* understand why Plex logs are so large.
* make sure Harbor retention policy is configured properly.
* setup a Paperless instance.
* setup a Sonarr instance.
* setup a Overseerr instance.
* understand how to apply values from a `common.yaml` file to several `kustomization.yaml` files.
* use more config maps instead of config PVCs.

## 🚀 Apps

* **Pro**: This namespace is for all the services hosted for me as a freelancer, such as Umami, HasteServer, Blog, DDPE, Diswho, Instaddict.
* **ManageInvite**: This namespace is for all the services hosted for my ManageInvite project (API, Dashboard, Discord bot).
* **Home**: This namespace is for all the services hosted for my personal use such as Vaultwarden, TimeTagger, Immich, Monica, Mealie, FileBrowser.
* **Managed**: This namespace is for all the services hosted for my clients.
* **Sushiflix**: This namespace is for all media services such as Plex, Radarr, Sonarr, Bazarr, Jackett, Qbittorrent, Sabnzbd, Tautulli, Overseerr.
* **DB**: This namespace is for all the databases such as PostgreSQL, PgAdmin4.
* **Workflows**: This namespace is for all the workflows such as Harbor.
* **Monitoring**: This namespace is for all the monitoring services such as Grafana, Prometheus, Alertgram, Promtail and Loki.
* **Backups**: One snapshot of each volume is taken every 30 minutes, and a backup is sent to a S3 bucket every night. The retention policy is 7 days for snapshots and 30 days for off-site backups. Movies and TV shows are not backed up, considered as non-critical data.

## 📜 Wiki

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

### Setup Sushiflix

The Plex server has to be accessed locally to be claimed. Use port forwarding to access it first. Then we need to specify the custom domain name in the server network settings (advanced), and specify `plex.androz2091.fr`. Otherwise it will try to load data from `server-ip:32400` or even `cluster-ip:32400` which is not securely accessible.

### View logs

Logs are collected by Promtail/Loki and can be access via the dashboard available at [grafana/loki-dashboard.json](./grafana/loki-dashboard.json).

⚠️ Onechart labels all its apps with `onechart` so we have to differentiate them using the `instance` label. For instance, please select `App > pro/onechart` and `Instance > manage-invite-bot` to view ManageInvite's logs.

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

Install CRI-O and Kubernetes. See [cri-o/packaging instructions.](https://github.com/cri-o/packaging/blob/main/README.md#distributions-using-deb-packages).

```sh
KUBERNETES_VERSION=v1.31
CRIO_VERSION=v1.30
```

Add the Kubernetes repository.

```sh
curl -fsSL https://pkgs.k8s.io/core:/stable:/$KUBERNETES_VERSION/deb/Release.key |
    gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/$KUBERNETES_VERSION/deb/ /" |
    tee /etc/apt/sources.list.d/kubernetes.list
```

Add the CRI-O repository.

```sh
curl -fsSL https://pkgs.k8s.io/addons:/cri-o:/stable:/$CRIO_VERSION/deb/Release.key |
    gpg --dearmor -o /etc/apt/keyrings/cri-o-apt-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/cri-o-apt-keyring.gpg] https://pkgs.k8s.io/addons:/cri-o:/stable:/$CRIO_VERSION/deb/ /" |
    tee /etc/apt/sources.list.d/cri-o.list
```

Install the packages.

```sh
apt-get update
apt-get install -y cri-o kubelet kubeadm kubectl
apt-mark hold cri-o kubelet kubeadm kubectl
```

Start the cluster

```sh
systemctl start crio.service
```

Forwarding IPv4 and letting iptables see bridged traffic.

```sh
cat <<EOF | tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

modprobe overlay
modprobe br_netfilter

# sysctl params required by setup, params persist across reboots
cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

# Apply sysctl params without reboot
sysctl --system

# Checks
lsmod | grep br_netfilter
lsmod | grep overlay

systemctl enable --now crio
```

Create the cluster.

```sh
kubeadm init --pod-network-cidr=10.244.0.0/16
```

Configure kubectl CLI to connect to the cluster.

```sh
export KUBECONFIG=/etc/kubernetes/admin.conf
```

Allow the current (single) node to be a worker node.

```sh
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
```

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
helm install longhorn longhorn/longhorn --namespace longhorn-system --create-namespace --version 1.7.0
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

### Troubleshooting

#### OpenSSL error

Understand why sometimes requests are terminated by a SSL error (1/5 requests for some services):
```sh
poca@localhost:~ (1) $ curl https://tautulli.androz2091.fr
curl: (35) OpenSSL/1.1.1l-fips: error:14094438:SSL routines:ssl3_read_bytes:tlsv1 alert internal error
```

Double check the `Caddyfile` and make sure that all the DNS are configured to the correct IP (sometimes when a SSL certificate fails to create/renew, such errors can occur **for all domains**).

Also... double check that `Caddy` is not started twice (see https://serverfault.com/questions/1167816/openssl-routinesssl3-read-bytestlsv1-alert-internal-error-with-kubernetes-and/1168625#1168625).
