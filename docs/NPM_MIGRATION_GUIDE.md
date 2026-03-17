# NPM Migration Guide

Migrate your NGINX Proxy Manager (NPM) configuration to StarlaneProxyManager (SPM).

## Prerequisites

- A running SPM instance with admin access
- Access to your NPM instance's data directory

## What Gets Migrated

| Entity | Migrated | Notes |
|---|---|---|
| Proxy Hosts | Yes | All configuration, domain names, forwarding rules |
| Redirection Hosts | Yes | All configuration, domain names, redirect rules |
| 404 Hosts | Yes | All configuration |
| Streams | Yes | All TCP/UDP stream configurations |
| Access Lists | Yes | Including auth users (bcrypt passwords) and client rules |
| Certificates | Yes (metadata) | Certificate database records are migrated. PEM files must be copied manually. |
| Settings | Yes (optional) | Default site and other system settings |
| Users | No | Users must be recreated in SPM |

## Step 1: Locate the NPM Database

The NPM SQLite database is typically found at:

- **Docker volume**: `/data/database.sqlite` inside the container
- **Docker Compose**: Check your `volumes` section for the data mount
- **Default path**: `/opt/nginx-proxy-manager/data/database.sqlite`

### Copy the database from a running Docker container

```bash
# Find your NPM container name
docker ps | grep nginx-proxy-manager

# Copy the database file
docker cp <container_name>:/data/database.sqlite ./npm-database.sqlite
```

### Copy from a Docker volume

```bash
# If using a named volume
docker run --rm -v npm_data:/data -v $(pwd):/backup alpine cp /data/database.sqlite /backup/npm-database.sqlite
```

## Step 2: Copy Certificate Files (Optional)

If you want to preserve your existing SSL certificates, copy them from the NPM instance:

### Let's Encrypt certificates

```bash
# Copy from Docker container
docker cp <container_name>:/etc/letsencrypt/ ./npm-letsencrypt/
```

### Custom certificates

```bash
# Copy from Docker container
docker cp <container_name>:/data/custom_ssl/ ./npm-custom-ssl/
```

### Restore certificates in SPM

After migration, copy the certificate files to your SPM instance:

```bash
# Let's Encrypt certs
docker cp ./npm-letsencrypt/ <spm_container>:/etc/letsencrypt/

# Custom certs
docker cp ./npm-custom-ssl/ <spm_container>:/data/custom_ssl/
```

Note: Certificate directory names use the format `npm-{id}`. The database IDs will change during migration, so you may need to rename directories to match the new IDs. The migration preview will show you the new IDs assigned to each certificate.

## Step 3: Upload the Database to SPM

1. Log in to your SPM instance as an admin
2. Navigate to **Import / Export** in the sidebar
3. Click the **Import / Migrate** tab
4. Under **NPM Migration**, click **Upload NPM Database**
5. Select your `database.sqlite` file

## Step 4: Review the Preview

After uploading, SPM will analyze the database and show you:

- **Summary**: Count of each entity type that will be imported
- **Conflicts**: Any domain names or ports that already exist in SPM

### Resolving Conflicts

For each conflict, you can choose:

- **Skip**: Do not import this item (keep the existing SPM configuration)
- **Overwrite**: Replace the existing SPM configuration with the NPM data

## Step 5: Commit the Import

1. Review all conflict resolutions
2. Click **Import** to apply the migration
3. SPM will:
   - Create all new entities in dependency order
   - Generate NGINX configurations for imported hosts
   - Reload NGINX to apply changes
4. Review the result summary

## Step 6: Post-Migration Tasks

### Re-request Let's Encrypt Certificates

Certificate metadata is migrated, but Let's Encrypt certificates need to be re-requested since the PEM files are tied to the certbot installation:

1. Go to **Certificates** in SPM
2. For each Let's Encrypt certificate, click **Renew**
3. Or, if you copied the certificate files (Step 2), verify they are in the correct location

### Verify Proxy Hosts

After migration, verify each proxy host is working:

1. Check that NGINX configurations were generated (look for green status indicators)
2. Test each domain by visiting it in a browser
3. Check the **Audit Log** for any import-related entries

### Recreate Users

Users are NOT migrated. You will need to:

1. Go to **Users** in SPM
2. Create each user with their email and roles
3. Set permissions as needed

## Troubleshooting

### "Failed to open SQLite database"

- Ensure the file is a valid SQLite database
- Check that the file is not corrupted (try opening it with `sqlite3` CLI)
- Make sure the file is the NPM `database.sqlite`, not a journal or WAL file

### Hosts show as offline after migration

- Check that NGINX configurations were generated: look in `/data/nginx/proxy_host/`
- Try disabling and re-enabling the affected hosts
- Check NGINX error logs: `docker logs <spm_container>`

### Certificate errors

- If you did not copy certificate files, hosts using those certs will show SSL errors
- Re-request Let's Encrypt certificates or re-upload custom certificates
- Temporarily set hosts to HTTP-only until certificates are restored

### Access list authentication not working

- Access list passwords are migrated as bcrypt hashes (they should work as-is)
- Verify the htpasswd files were generated: check `/data/access/`
- Try editing and re-saving the access list to regenerate the htpasswd file
