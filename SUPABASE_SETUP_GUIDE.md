# 🚀 Supabase Setup Guide for BDIP

This guide will help you set up Supabase for the Business Development Intelligence Platform.

## 📋 Prerequisites

- Node.js 18+ installed
- pnpm package manager
- Git repository initialized

## 🔧 Step 1: Create Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" 
3. Sign up with GitHub, GitLab, or email
4. Verify your email if required

## 🏗️ Step 2: Create New Project

1. Click "New Project" in your Supabase dashboard
2. Enter project details:
   - **Name**: `BDIP` or `chambers-bdip`
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to UK (e.g., London `eu-west-2`)
   - **Pricing Plan**: Free tier is sufficient for development

3. Click "Create new project" and wait 2-3 minutes for provisioning

## 🔑 Step 3: Get Your API Keys

1. Once project is ready, go to **Settings → API**
2. Copy these values:
   - **Project URL**: `https://[your-project-id].supabase.co`
   - **Anon/Public Key**: Long string starting with `eyJ...`
   - **Service Role Key**: Another long string (keep this SECRET!)

## 📝 Step 4: Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.local.example .env.local
```

2. Edit `.env.local` and add your Supabase credentials:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
SUPABASE_SERVICE_KEY=eyJ...your-service-key...

# Keep other settings as is for now
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENABLE_AI_SCORING=true
ENABLE_AUTO_ROUTING=true
```

## 🗄️ Step 5: Run Database Migrations

### Option A: Using Supabase Dashboard (Recommended for Quick Start)

1. Go to **SQL Editor** in your Supabase dashboard
2. Click "New Query"
3. Copy and paste each migration file in order:
   - First: `/supabase/migrations/20250101000000_create_core_schema.sql`
   - Second: `/supabase/migrations/20250102000000_create_rls_policies.sql`
   - Third: `/supabase/migrations/20250103000000_create_business_functions.sql`
   - Fourth: `/supabase/migrations/20250104000000_create_triggers.sql`
   - Fifth: `/supabase/migrations/20250105000000_create_analytics_views.sql`

4. Run each migration by clicking "Run" (Cmd/Ctrl + Enter)
5. Verify no errors in the output

### Option B: Using Supabase CLI (For Production)

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link your project:
```bash
supabase link --project-ref [your-project-id]
```

4. Run migrations:
```bash
supabase db push
```

## 🌱 Step 6: Seed Test Data (Optional)

1. In SQL Editor, open a new query
2. Copy contents of `/supabase/seed.sql`
3. Run the query to populate test data

This will create:
- 12 sample barristers (various seniority levels)
- 5 clerks with teams
- 10 clients (companies, individuals, solicitors)
- Sample enquiries and tasks

## ✅ Step 7: Verify Setup

1. Test your connection by running:
```bash
pnpm dev
```

2. Open [http://localhost:3000](http://localhost:3000)

3. Check Supabase dashboard:
   - **Table Editor**: Should show all tables with data
   - **Authentication → Users**: Ready for user creation
   - **Storage**: Available for document uploads

## 🔒 Step 8: Enable Row Level Security (Important!)

RLS is already configured in the migrations, but verify it's enabled:

1. Go to **Authentication → Policies**
2. Ensure RLS is enabled for all tables
3. Check that policies are active (green status)

## 📧 Step 9: Configure Email (Optional - For Later)

1. Go to **Authentication → Email Templates**
2. Customize templates for:
   - Confirmation emails
   - Password reset
   - Magic links

3. For production, configure SMTP:
   - Go to **Settings → Email**
   - Add your SMTP credentials (e.g., Resend, SendGrid)

## 🎯 Step 10: Quick Connection Test

Create a test file `test-connection.js`:

```javascript
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  const { data, error } = await supabase
    .from('barristers')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('Connection failed:', error)
  } else {
    console.log('Connection successful! Found:', data)
  }
}

testConnection()
```

Run with:
```bash
node test-connection.js
```

## 🚨 Troubleshooting

### Common Issues:

1. **"Invalid API key"**
   - Double-check your keys in `.env.local`
   - Ensure no extra spaces or quotes

2. **"relation does not exist"**
   - Run migrations in the correct order
   - Check SQL Editor for any errors

3. **"permission denied"**
   - Ensure RLS policies are correctly applied
   - Check service role key for admin operations

4. **Connection timeouts**
   - Verify project is fully provisioned
   - Check network/firewall settings

## 📚 Additional Resources

- [Supabase Docs](https://supabase.com/docs)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)

## 🔄 Next Steps

Once Supabase is configured:

1. **Test Authentication**: Create a test user account
2. **Import Sample Data**: Use the CSV import feature
3. **Explore Dashboard**: Check the Table Editor and SQL Editor
4. **Monitor Usage**: Keep an eye on the free tier limits

## 💡 Pro Tips

- Use **Supabase Studio** (Table Editor) to quickly view/edit data during development
- Enable **Realtime** for tables that need live updates (enquiries, tasks)
- Set up **Database Backups** before going to production
- Use **Edge Functions** for complex business logic
- Monitor **Database Performance** in the dashboard

---

## 🎉 Setup Complete!

Your Supabase backend is now ready for the BDIP application. The database schema supports:

- ✅ Multi-user authentication
- ✅ Row-level security
- ✅ CSV import/export
- ✅ Real-time updates
- ✅ Performance analytics
- ✅ Audit trails

Happy coding! 🚀