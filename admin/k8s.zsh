# Admin access from the Mac: kubectl, helm, k9s and argocd reach the API server (10.8.0.1:6443, only
# on the WireGuard link) through an SSH tunnel to the control plane. Install: README > Admin access.

K8S_VPS=debian@148.113.245.134
K8S_KEY=$HOME/.ssh/mbp2024
K8S_FORWARD=16443:10.8.0.1:6443
K8S_ARGOCD=$HOME/.kube/argocd-core.yaml
export KUBECONFIG=$HOME/.kube/k8s-infrastructure.yaml

k8s-tunnel() {
  case ${1:-up} in
    up)     nc -z 127.0.0.1 16443 2>/dev/null ||
              ssh -i $K8S_KEY -fN -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L $K8S_FORWARD $K8S_VPS ;;
    down)   pkill -f "L $K8S_FORWARD" ;;
    status) nc -z 127.0.0.1 16443 2>/dev/null && echo "tunnel up" || echo "tunnel down" ;;
  esac
}

k8s-login() {
  (umask 077 && mkdir -p $HOME/.kube &&
    ssh -i $K8S_KEY $K8S_VPS "sudo kubeadm kubeconfig user --client-name=$USER" > $KUBECONFIG) &&
  command kubectl config set-cluster kubernetes --server=https://127.0.0.1:16443 --tls-server-name=api.k8s.internal &&
  command kubectl config set-context argocd --cluster=kubernetes --user=$USER --namespace=argocd &&
  printf 'apiVersion: v1\nkind: Config\ncurrent-context: argocd\n' > $K8S_ARGOCD &&
  kubectl get nodes
}

kubectl() { k8s-tunnel && command kubectl "$@"; }   # the tunnel opens itself when needed
helm()    { k8s-tunnel && command helm "$@"; }
k9s()     { k8s-tunnel && command k9s "$@"; }
# --core: no ArgoCD login, the CLI uses the cluster certificate. It reads ArgoCD's namespace from the
# current context only, so $K8S_ARGOCD, listed first, makes the "argocd" context current for it alone
argocd()  { k8s-tunnel && KUBECONFIG=$K8S_ARGOCD:$KUBECONFIG command argocd --core "$@"; }
alias k=kubectl
