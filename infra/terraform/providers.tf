terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws    = { source = "hashicorp/aws",    version = "~> 5.40" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {
    bucket         = "ns-tf-state"
    key            = "envs/default/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ns-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region
  default_tags { tags = local.common_tags }
}
