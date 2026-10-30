-- =============================================================================
-- DevProbe — Initial Database Schema
-- Day 9: MySQL Database Foundation
--
-- This schema establishes the relational database structure for DevProbe persistence:
-- - Collections: Logical grouping of saved API requests
-- - Saved Requests: Request configuration including method, URL, headers, params, body
--
-- Compatibility: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.4+ (XAMPP compatible)
-- Character Set: utf8mb4 (Full Unicode support including emojis and special symbols)
-- Collation: utf8mb4_unicode_ci
-- Re-runnable: Safe to execute multiple times (CREATE TABLE IF NOT EXISTS)
--
-- Security Notice:
-- In accordance with DevProbe security standards, plaintext passwords, session tokens,
-- and live authorization credentials are NEVER persisted to database tables.
-- =============================================================================

-- 1. Ensure target database exists
CREATE DATABASE IF NOT EXISTS `devprobe_db`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `devprobe_db`;

-- -----------------------------------------------------------------------------
-- Table: collections
-- Groups related API requests into logical folders/collections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `collections` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_collections_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: saved_requests
-- Persists HTTP request configurations linked optionally to a parent collection
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `saved_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `collection_id` INT UNSIGNED NULL,
  `name` VARCHAR(255) NOT NULL,
  `method` VARCHAR(10) NOT NULL,
  `url` TEXT NOT NULL,
  `headers` JSON NULL,
  `params` JSON NULL,
  `body` MEDIUMTEXT NULL,
  `body_type` VARCHAR(20) NOT NULL DEFAULT 'none',
  `auth_type` VARCHAR(20) NOT NULL DEFAULT 'none',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_saved_requests_collection_id` (`collection_id`),
  INDEX `idx_saved_requests_method` (`method`),
  CONSTRAINT `fk_saved_requests_collection`
    FOREIGN KEY (`collection_id`)
    REFERENCES `collections` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: environments
-- Day 12: Logical environments (e.g. Development, Staging, Production)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `environments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_environments_name` (`name`),
  INDEX `idx_environments_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: environment_variables
-- Day 12: Key-value variable pairs associated with an environment
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `environment_variables` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `environment_id` INT UNSIGNED NOT NULL,
  `var_key` VARCHAR(255) NOT NULL,
  `var_value` TEXT NULL,
  `is_secret` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_env_vars_env_id` (`environment_id`),
  INDEX `idx_env_vars_key` (`var_key`),
  UNIQUE KEY `uk_env_vars_env_key` (`environment_id`, `var_key`),
  CONSTRAINT `fk_env_vars_environment`
    FOREIGN KEY (`environment_id`)
    REFERENCES `environments` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


