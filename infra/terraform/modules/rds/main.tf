variable "name"               { type = string }
variable "subnet_ids"         { type = list(string) }
variable "vpc_id"             { type = string }
variable "db_instance_class"  { type = string }
variable "allocated_storage"  { type = number }
variable "app_security_group" { type = string }

resource "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "db" {
  name   = "${var.name}-db"
  vpc_id = var.vpc_id
}
resource "aws_security_group_rule" "db_ingress" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.db.id
  source_security_group_id = var.app_security_group
}

resource "aws_db_instance" "this" {
  identifier              = var.name
  engine                  = "postgres"
  engine_version          = "15.5"
  instance_class          = var.db_instance_class
  allocated_storage       = var.allocated_storage
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = "app"
  username                = "ns_admin"
  password                = random_password.master.result
  vpc_security_group_ids  = [aws_security_group.db.id]
  db_subnet_group_name    = aws_db_subnet_group.this.name
  multi_az                = true
  backup_retention_period = 14
  delete_automated_backups = false
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.name}-final"
  performance_insights_enabled = true
}

resource "aws_secretsmanager_secret" "db" { name = "${var.name}/rds/master" }
resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = aws_db_instance.this.username
    password = random_password.master.result
    host     = aws_db_instance.this.address
    port     = aws_db_instance.this.port
    dbname   = aws_db_instance.this.db_name
  })
}

output "endpoint"        { value = aws_db_instance.this.endpoint }
output "connection_url"  { sensitive = true; value = "postgres://${aws_db_instance.this.username}:${random_password.master.result}@${aws_db_instance.this.endpoint}/${aws_db_instance.this.db_name}" }
