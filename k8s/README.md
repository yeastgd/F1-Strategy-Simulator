# Demo-grade Kubernetes manifests (no Ingress / HPA / PVCs).

This repo uses **kind** (Kubernetes in Docker). It is a single binary on top of
Docker — lighter than minikube, which typically brings a VM or extra cluster
lifecycle. You already need Docker for compose / image builds.

```bash
# 1. Cluster
kind create cluster --name f1-strategy

# 2. Images (tags must match the Deployment specs)
docker build -t f1-strategy-backend:local ./backend
docker build --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 -t f1-strategy-frontend:local ./frontend
docker build -t f1-strategy-validation:local ./validation-service
kind load docker-image f1-strategy-backend:local --name f1-strategy
kind load docker-image f1-strategy-frontend:local --name f1-strategy
kind load docker-image f1-strategy-validation:local --name f1-strategy

# 3. Apply (ConfigMap is 00-configmap.yaml so it lands with the Deployments)
kubectl apply -f k8s/

# 4. Port-forward (browser talks to localhost, matching CORS / NEXT_PUBLIC_API_URL)
kubectl port-forward svc/frontend 3000:3000
# other terminal:
kubectl port-forward svc/backend 8000:8000
```

Then open http://localhost:3000. Tear down with `kind delete cluster --name f1-strategy`.
