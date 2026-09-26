# 무한리필 실행기 - GitHub Pages 배포

## 깃허브에서 바로 발행 (Vercel 필요 없음)

### 1. 푸시
```bash
git init
git add .
git commit -m "feat: 무한리필 PWA - GitHub Pages 배포"
git branch -M main
git remote add origin https://github.com/YOUR_ID/REPO.git
git push -u origin main
```

### 2. GitHub 설정 (한 번만)
1. 깃허브 레포 → Settings → Pages
2. Source: **GitHub Actions** 선택 (중요!)
3. 저장 → 자동으로 위 deploy.yml이 실행됨

### 3. 배포 확인
- Actions 탭에서 빌드 돌아가는 거 확인
- 완료되면 Pages에서 주는 URL: `https://YOUR_ID.github.io/REPO/`
- 이 URL을 iPhone Safari에서 열고 → 공유 → 홈 화면에 추가

끝. Vercel 필요 없이 깃허브만으로 PWA 배포 완료.

## 로컬 실행
npm install
npm run dev
