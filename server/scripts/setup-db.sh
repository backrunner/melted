#!/bin/bash
# Development database setup script

set -e

echo "🗄️  Melted Server - Database Setup"
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed."
    echo ""
    echo "Please install PostgreSQL using one of these methods:"
    echo ""
    echo "1. Using Homebrew (macOS):"
    echo "   brew install postgresql@16"
    echo "   brew services start postgresql@16"
    echo ""
    echo "2. Using Docker Compose (recommended for development):"
    echo "   docker-compose up -d"
    echo ""
    exit 1
fi

# Check if PostgreSQL is running
if ! pg_isready -q 2>/dev/null; then
    echo "❌ PostgreSQL is not running."
    echo ""
    echo "Start PostgreSQL:"
    echo "  - Homebrew: brew services start postgresql@16"
    echo "  - Docker: docker-compose up -d"
    echo ""
    exit 1
fi

echo "✅ PostgreSQL is running"
echo ""

# Database configuration
DB_NAME="melted_dev"
DB_USER="melted"
DB_PASSWORD="melted_dev_password"

echo "Creating database and user..."

# Create user if not exists
psql -U postgres -tc "SELECT 1 FROM pg_user WHERE usename = '$DB_USER'" | grep -q 1 || \
    psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

# Create database if not exists
psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "✅ Database created: $DB_NAME"
echo ""

# Update config.yaml
CONFIG_FILE="config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Creating config.yaml from example..."
    cp config.example.yaml config.yaml
fi

# Update database URL in config.yaml
sed -i.bak "s|url:.*|url: postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME|g" config.yaml
rm -f config.yaml.bak

echo "✅ Updated $CONFIG_FILE"
echo ""

# Run migrations if available
if command -v pnpm &> /dev/null; then
    echo "Running database migrations..."
    pnpm db:migrate 2>/dev/null || echo "⚠️  No migrations found (will run on first server start)"
fi

echo ""
echo "🎉 Database setup complete!"
echo ""
echo "Connection string:"
echo "postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""
echo "Start the server with:"
echo "  pnpm dev"
