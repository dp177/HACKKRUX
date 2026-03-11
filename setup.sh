#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# TRIAGE SYSTEM - SETUP SCRIPT
# Installs dependencies and starts all services
# ═══════════════════════════════════════════════════════════════

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════"
echo "  🏥 TRIAGE SYSTEM - AUTOMATED SETUP"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ═══════════════════════════════════════════════════════════════
# Check Prerequisites
# ═══════════════════════════════════════════════════════════════

echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version)${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 not found. Please install Python 3.10+${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python $(python3 --version)${NC}"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠ PostgreSQL client not found. Make sure PostgreSQL server is installed.${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL client available${NC}"
fi

# Check Ollama
if ! command -v ollama &> /dev/null; then
    echo -e "${YELLOW}⚠ Ollama not found. LLM features will not work.${NC}"
    echo "  Install: curl -fsSL https://ollama.com/install.sh | sh"
else
    echo -e "${GREEN}✓ Ollama installed${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Database Setup
# ═══════════════════════════════════════════════════════════════

echo "🗄️  Setting up PostgreSQL database..."

# Ask for database credentials
read -p "PostgreSQL username [postgres]: " DB_USER
DB_USER=${DB_USER:-postgres}

read -sp "PostgreSQL password: " DB_PASSWORD
echo ""

read -p "Database name [triage_db]: " DB_NAME
DB_NAME=${DB_NAME:-triage_db}

# Create database if it doesn't exist
export PGPASSWORD=$DB_PASSWORD
if psql -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${YELLOW}⚠ Database $DB_NAME already exists${NC}"
else
    echo "Creating database $DB_NAME..."
    psql -U $DB_USER -c "CREATE DATABASE $DB_NAME;"
    echo -e "${GREEN}✓ Database created${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Ollama Model Setup
# ═══════════════════════════════════════════════════════════════

echo "🤖 Setting up Ollama Llama2 model..."

if command -v ollama &> /dev/null; then
    # Check if llama2 is already pulled
    if ollama list | grep -q "llama2"; then
        echo -e "${GREEN}✓ Llama2 model already installed${NC}"
    else
        echo "Downloading Llama2 model (3GB)... This may take a few minutes."
        ollama pull llama2
        echo -e "${GREEN}✓ Llama2 model downloaded${NC}"
    fi
    
    # Start Ollama server in background
    echo "Starting Ollama server..."
    ollama serve > /dev/null 2>&1 &
    sleep 3
    echo -e "${GREEN}✓ Ollama server started${NC}"
else
    echo -e "${YELLOW}⚠ Skipping Ollama setup (not installed)${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# Python Triage Engine Setup
# ═══════════════════════════════════════════════════════════════

echo "🐍 Setting up Python triage engine..."

cd triage_engine

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install -q -r requirements.txt
echo -e "${GREEN}✓ Python dependencies installed${NC}"

cd ..

echo ""

# ═══════════════════════════════════════════════════════════════
# Node.js Backend Setup
# ═══════════════════════════════════════════════════════════════

echo "📦 Setting up Node.js backend..."

cd backend

# Install dependencies
echo "Installing Node.js dependencies..."
npm install --silent
echo -e "${GREEN}✓ Node.js dependencies installed${NC}"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env configuration..."
    cat > .env <<EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Server Configuration
NODE_ENV=development
PORT=5000

# JWT Secret (generate a random one in production)
JWT_SECRET=$(openssl rand -hex 32)

# Python Triage Engine URL
TRIAGE_ENGINE_URL=http://localhost:5001

# CORS Origins
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:19006

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
EOF
    echo -e "${GREEN}✓ .env file created${NC}"
else
    echo -e "${YELLOW}⚠ .env file already exists${NC}"
fi

cd ..

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ SETUP COMPLETE!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "🚀 To start the system:"
echo ""
echo "  1. Start Python triage engine:"
echo "     cd triage_engine && source venv/bin/activate && python main.py"
echo ""
echo "  2. Start Node.js backend (in new terminal):"
echo "     cd backend && npm run dev"
echo ""
echo "  3. Access the services:"
echo "     - Node.js API: http://localhost:5000"
echo "     - Python Triage: http://localhost:5001"
echo "     - Health Check: http://localhost:5000/health"
echo ""
echo "📖 Documentation:"
echo "   - Main README: ./README.md"
echo "   - Backend API: ./backend/README.md"
echo "   - Triage Engine: ./triage_engine/README.md"
echo ""
echo "═══════════════════════════════════════════════════════════"
