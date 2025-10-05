(* Обновлённый пример F#: всё в main, только if/elif/else, match/with, for, while. *)

open System

[<EntryPoint>]
let main argv =
    // 5-кратная вложенность для теста уровня вложенности
    while true do
        while true do
            while true do
                while true do
                    while true do
                        printf "n = "
                        let s = Console.ReadLine()
                        let mutable n = 0
                        match System.Int32.TryParse s with
                        | true, v -> n <- v
                        | _ -> n <- 0

                        if n < 0 then
                            printfn "negative"
                        elif n = 0 then
                            printfn "zero"
                        else
                            printfn "positive"

                        let dayName =
                            match (n % 7) with
                            | 1 -> "Mon"
                            | 2 -> "Tue"
                            | 3 -> "Wed"
                            | 4 -> "Thu"
                            | 5 -> "Fri"
                            | 6 | 0 -> "Weekend"
                            | _ -> "Unknown"

                        printfn "%s" dayName

                        for i in 0 .. 5 do
                            if i % 2 = 0 then
                                printfn "even %d" i
                            else
                                printfn "odd %d" i

                        let mutable k = 0
                        while k < 3 do
                            printfn "k=%d" k
                            k <- k + 1

                        // Выходим, чтобы не зациклиться
                        System.Environment.Exit 0
    0


