<?php
echo "<h1>Servidor Locaweb OK!</h1>";
echo "<p>PHP Version: " . phpversion() . "</p>";
echo "<p>Se voce esta vendo isso, o servidor esta funcionando.</p>";
echo "<h2>Arquivos na pasta raiz:</h2>";
$files = scandir('.');
foreach($files as $file) {
    echo $file . "<br>";
}
?>
