# Barber Shop Appointment Booking System – Backend

## Installation & Running

### 1. Install dependencies

```bash
npm install
```

### 2. Development

```bash
npm run dev
```

Server runs at http://localhost:3000

### 3. Production build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t barber-backend .
docker run -p 3000:3000 \
  -v "$(pwd)/db.json:/app/db.json" \
  barber-backend
```

### Data Persistence

Appointments are stored in `db.json`. When using Docker, mount the file as a volume so data persists between container restarts.
