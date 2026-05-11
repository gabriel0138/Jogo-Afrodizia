-- phpMyAdmin SQL Dump
-- version 4.7.7
-- https://www.phpmyadmin.net/
--
-- Host: 186.202.152.241
-- Generation Time: 11-Maio-2026 às 12:05
-- Versão do servidor: 5.7.32-35-log
-- PHP Version: 5.6.40-0+deb8u12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `afrodizia`
--

-- --------------------------------------------------------

--
-- Estrutura da tabela `afrodizia_players`
--

CREATE TABLE `afrodizia_players` (
  `id` int(11) NOT NULL,
  `instagram` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `best_score` int(11) DEFAULT '0',
  `total_vozes` int(11) DEFAULT '0',
  `unlocked_chars` text COLLATE utf8mb4_unicode_ci,
  `last_char` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'massau',
  `total_runs` int(11) DEFAULT '1',
  `last_seen` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Extraindo dados da tabela `afrodizia_players`
--

INSERT INTO `afrodizia_players` (`id`, `instagram`, `name`, `best_score`, `total_vozes`, `unlocked_chars`, `last_char`, `total_runs`, `last_seen`, `created_at`, `updated_at`) VALUES
(1, 'afrodizia_oficial', 'Afrodizia Team', 1000, 5000, '[\"massau\"]', 'massau', 1, '2026-05-08 18:36:20', '2026-05-08 18:36:20', '2026-05-08 18:36:20');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `afrodizia_players`
--
ALTER TABLE `afrodizia_players`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_instagram` (`instagram`),
  ADD KEY `idx_best_score` (`best_score`),
  ADD KEY `idx_last_seen` (`last_seen`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `afrodizia_players`
--
ALTER TABLE `afrodizia_players`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
